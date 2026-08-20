'use strict';

const { FollowRepository } = require('./FollowRepository');
const { NotificationRepository } = require('./NotificationRepository');
const { OneSignalService } = require('./OneSignalService');
const { UserRepository } = require('./UserRepository');
const { isMockUserId } = require('./MockChatService');
const { logger } = require('../utils/logger');

const PUSH_COPY = {
  follow_request: {
    heading: 'Zovi',
    body: (name) => `${name} sana takip isteği gönderdi`,
    messageKey: 'notifications_follow_request',
  },
  started_following: {
    heading: 'Zovi',
    body: (name) => `${name} seni takip etmeye başladı`,
    messageKey: 'notifications_started_following',
  },
  follow_accepted: {
    heading: 'Zovi',
    body: (name) => `${name} takip isteğini kabul etti`,
    messageKey: 'notifications_follow_accepted',
  },
  check_in_tagged: {
    heading: 'Zovi',
    body: (name, ctx = {}) => {
      const place = String(ctx.placeName || '').trim();
      return place
        ? `${name} seni ${place}'da bir check-in'e ekledi`
        : `${name} seni bir check-in'de etiketledi`;
    },
    messageKey: 'notifications_check_in_tagged',
  },
  story_like: {
    heading: 'Zovi',
    body: (name, ctx = {}) => {
      const count = Number(ctx.aggCount || 0);
      if (count >= 2) return `${count} kişi story’yi beğendi`;
      return `${name} story’ni beğendi`;
    },
    messageKey: 'notifications_liked_story',
  },
  chat_message: {
    heading: (name, ctx = {}) => {
      if (ctx.isGroup && ctx.groupName) return ctx.groupName;
      return name;
    },
    body: (name, ctx = {}) => {
      const count = Number(ctx.aggCount || 0);
      if (count >= 2) {
        return ctx.isGroup && ctx.groupName
          ? `${count} yeni mesaj`
          : `${count} yeni mesaj`;
      }
      const preview = String(ctx.preview || '').trim();
      if (preview) return preview;
      return `${name} mesaj gönderdi`;
    },
    messageKey: 'chat_message_received',
  },
  chat_request: {
    heading: (name) => name,
    body: (name, ctx = {}) => {
      const count = Number(ctx.aggCount || 0);
      if (count >= 2) return `${count} mesaj isteği`;
      const preview = String(ctx.preview || '').trim();
      if (preview) return preview;
      return `${name} mesaj isteği gönderdi`;
    },
    messageKey: 'chat_message_request',
  },
};

class NotificationService {
  constructor({
    notifications = new NotificationRepository(),
    oneSignal = new OneSignalService(),
    users = new UserRepository(),
    follows = new FollowRepository(),
  } = {}) {
    this.notifications = notifications;
    this.oneSignal = oneSignal;
    this.users = users;
    this.follows = follows;
  }

  async notifyFollowRequest({ recipientId, actorId, requestId }) {
    return this._createAndPush({
      recipientId,
      actorId,
      type: 'follow_request',
      objectType: 'follow_request',
      objectId: requestId,
      action: 'accept_follow_request',
    });
  }

  async notifyStartedFollowing({ recipientId, actorId }) {
    const alreadyFollowsBack = await this.follows.isFollowing(
      recipientId,
      actorId,
    );
    return this._createAndPush({
      recipientId,
      actorId,
      type: 'started_following',
      objectType: 'user',
      objectId: actorId,
      action: alreadyFollowsBack ? 'none' : 'follow_back',
    });
  }

  async notifyFollowAccepted({ recipientId, actorId, requestId }) {
    // actorId = who accepted (B). recipientId = who sent the request (A).
    // B's inbox row must not offer "follow back" if B already follows A or
    // already has a pending outgoing request to A.
    const rel = await this.follows.getRelationship(actorId, recipientId);
    let acceptorAction = 'follow_back';
    if (rel.following) acceptorAction = 'none';
    else if (rel.outgoingRequest) acceptorAction = 'request_sent';

    await this.notifications.updateActionForObject({
      recipientId: actorId,
      objectType: 'follow_request',
      objectId: requestId,
      action: acceptorAction,
      type: 'started_following',
    });

    return this._createAndPush({
      recipientId,
      actorId,
      type: 'follow_accepted',
      objectType: 'follow_request',
      objectId: requestId,
      action: 'none',
    });
  }

  async notifyCheckInTagged({
    recipientId,
    actorId,
    checkInId,
    placeName = '',
  }) {
    return this._createAndPush({
      recipientId,
      actorId,
      type: 'check_in_tagged',
      objectType: 'check_in',
      objectId: checkInId,
      action: 'none',
      context: { placeName: String(placeName || '').trim() },
    });
  }

  async notifyStoryLike({
    recipientId,
    actorId,
    storyId,
    thumbnailUrl = '',
  }) {
    if (!recipientId || !actorId || recipientId === actorId) return null;

    const thumb = String(thumbnailUrl || '').trim() || null;
    const windowSec = 60;

    const recent = await this.notifications.findRecentForObject({
      recipientId,
      type: 'story_like',
      objectType: 'story',
      objectId: storyId,
      withinSeconds: windowSec,
    });

    const actor = await this.users.getProfile(actorId);
    const actorName =
      actor?.fullName?.trim() ||
      actor?.username?.trim() ||
      'Birisi';

    if (recent) {
      const prev = Number(recent.agg_count) > 0 ? Number(recent.agg_count) : 1;
      const nextCount = prev + 1;
      const bodyKey =
        nextCount >= 2
          ? 'notifications_people_liked_story'
          : 'notifications_liked_story';

      const row = await this.notifications.bumpAggregate({
        id: recent.id,
        actorId,
        aggCount: nextCount,
        bodyKey,
        thumbnailUrl: thumb || recent.thumbnail_url || null,
        action: 'open_story',
        payload: {
          actorName,
          actorUsername: actor?.username || '',
          thumbnailUrl: thumb || recent.thumbnail_url || '',
          aggCount: nextCount,
        },
      });

      const mapped = this.notifications.mapRow(row);
      this._pushStoryLike({
        recipientId,
        actorId,
        actor,
        actorName,
        mapped,
        storyId,
        thumbnailUrl: thumb || mapped?.thumbnailUrl || '',
        aggCount: nextCount,
      });
      return mapped;
    }

    const row = await this.notifications.create({
      recipientId,
      actorId,
      type: 'story_like',
      objectType: 'story',
      objectId: storyId,
      action: 'open_story',
      bodyKey: 'notifications_liked_story',
      thumbnailUrl: thumb,
      aggCount: 1,
      payload: {
        actorName,
        actorUsername: actor?.username || '',
        thumbnailUrl: thumb || '',
        aggCount: 1,
      },
    });

    const mapped = this.notifications.mapRow(row);
    this._pushStoryLike({
      recipientId,
      actorId,
      actor,
      actorName,
      mapped,
      storyId,
      thumbnailUrl: thumb || '',
      aggCount: 1,
    });
    return mapped;
  }

  async notifyChatMessage({
    recipientId,
    senderId,
    conversationId,
    preview = '',
    isRequest = false,
    isGroup = false,
    groupName = '',
    tribeId = '',
    mediaThumbnailUrl = '',
    lastMessageAt = null,
  }) {
    if (!recipientId || !senderId || recipientId === senderId) return null;
    // Mock accounts are not real devices — never push / inbox them.
    if (isMockUserId(recipientId)) return null;
    const convId = String(conversationId || '').trim();
    if (!convId) return null;

    const settings = await this.users.ensureSettings(recipientId);
    if (!settings?.pushEnabled || !settings?.chatNotifications) return null;

    const type = isRequest ? 'chat_request' : 'chat_message';
    const windowSec = 60;
    const thumb = String(mediaThumbnailUrl || '').trim() || null;
    const previewText = String(preview || '').trim();
    const groupLabel = String(groupName || '').trim();
    const tribe = String(tribeId || '').trim();

    const recent = await this.notifications.findRecentForObject({
      recipientId,
      type,
      objectType: 'conversation',
      objectId: convId,
      withinSeconds: windowSec,
    });

    const actor = await this.users.getProfile(senderId);
    const actorName =
      actor?.fullName?.trim() ||
      actor?.username?.trim() ||
      'Birisi';
    const batchBodyKey = 'notifications_chat_messages_batch';
    const singleBodyKey = isRequest
      ? 'chat_message_request'
      : 'chat_message_received';

    const basePayload = {
      actorName,
      actorUsername: actor?.username || '',
      preview: previewText,
      aggCount: 1,
      isRequest,
      isGroup,
      groupName: groupLabel,
      tribeId: tribe,
      conversationId: convId,
      lastMessageAt: lastMessageAt || '',
      thumbnailUrl: thumb || '',
    };

    if (recent) {
      const prev = Number(recent.agg_count) > 0 ? Number(recent.agg_count) : 1;
      const nextCount = prev + 1;
      const bodyKey = nextCount >= 2 ? batchBodyKey : singleBodyKey;
      const payload = { ...basePayload, aggCount: nextCount };

      const row = await this.notifications.bumpAggregate({
        id: recent.id,
        actorId: senderId,
        aggCount: nextCount,
        bodyKey,
        thumbnailUrl: thumb || recent.thumbnail_url || null,
        action: 'open_chat',
        payload,
      });

      const mapped = this.notifications.mapRow(row);
      this._pushChatMessage({
        recipientId,
        senderId,
        actor,
        actorName,
        mapped,
        conversationId: convId,
        preview: previewText,
        isRequest,
        isGroup,
        groupName: groupLabel,
        tribeId: tribe,
        mediaThumbnailUrl: thumb || mapped?.thumbnailUrl || '',
        aggCount: nextCount,
        lastMessageAt,
      });
      return mapped;
    }

    const row = await this.notifications.create({
      recipientId,
      actorId: senderId,
      type,
      objectType: 'conversation',
      objectId: convId,
      action: 'open_chat',
      bodyKey: singleBodyKey,
      thumbnailUrl: thumb,
      aggCount: 1,
      payload: basePayload,
    });

    const mapped = this.notifications.mapRow(row);
    this._pushChatMessage({
      recipientId,
      senderId,
      actor,
      actorName,
      mapped,
      conversationId: convId,
      preview: previewText,
      isRequest,
      isGroup,
      groupName: groupLabel,
      tribeId: tribe,
      mediaThumbnailUrl: thumb || '',
      aggCount: 1,
      lastMessageAt,
    });
    return mapped;
  }

  _pushChatMessage({
    recipientId,
    senderId,
    actor,
    actorName,
    mapped,
    conversationId,
    preview,
    isRequest,
    isGroup,
    groupName,
    tribeId,
    mediaThumbnailUrl,
    aggCount,
    lastMessageAt,
  }) {
    const type = isRequest ? 'chat_request' : 'chat_message';
    const copy = PUSH_COPY[type];
    const ctx = {
      aggCount,
      preview,
      isGroup,
      groupName,
    };
    const messageKey =
      aggCount >= 2
        ? 'notifications_chat_messages_batch'
        : copy.messageKey;
    const heading =
      typeof copy.heading === 'function'
        ? copy.heading(actorName, ctx)
        : copy.heading;
    const body =
      typeof copy.body === 'function'
        ? copy.body(actorName, ctx)
        : copy.body;

    this.oneSignal
      .sendToUser({
        userId: recipientId,
        heading,
        body,
        collapseId: `chat_${conversationId}`,
        data: {
          type,
          notificationId: mapped.id,
          actorId: senderId || '',
          objectId: conversationId || '',
          conversationId,
          action: 'open_chat',
          messageKey,
          username: aggCount >= 2 ? '' : actor?.username || '',
          displayName:
            aggCount >= 2 && isGroup && groupName
              ? groupName
              : actorName,
          avatarUrl: actor?.avatarUrl || '',
          thumbnailUrl: mediaThumbnailUrl || '',
          preview: preview || '',
          folder: isRequest ? 'request' : 'inbox',
          isRequest,
          isGroup,
          groupName: groupName || '',
          tribeId: tribeId || '',
          lastMessageAt: lastMessageAt || '',
          aggCount: String(aggCount),
        },
      })
      .catch((err) => {
        logger.error('notify_push_failed', {
          err: err.message,
          type,
        });
      });
  }

  _pushStoryLike({
    recipientId,
    actorId,
    actor,
    actorName,
    mapped,
    storyId,
    thumbnailUrl,
    aggCount,
  }) {
    const copy = PUSH_COPY.story_like;
    const messageKey =
      aggCount >= 2
        ? 'notifications_people_liked_story'
        : copy.messageKey;

    this.oneSignal
      .sendToUser({
        userId: recipientId,
        heading: copy.heading,
        body: copy.body(actorName, { aggCount }),
        collapseId: `story_like_${storyId}`,
        data: {
          type: 'story_like',
          notificationId: mapped.id,
          actorId: actorId || '',
          objectId: storyId || '',
          action: 'open_story',
          messageKey,
          username: aggCount >= 2 ? '' : actor?.username || '',
          displayName: aggCount >= 2 ? '' : actorName,
          avatarUrl: actor?.avatarUrl || '',
          thumbnailUrl: thumbnailUrl || '',
          aggCount: String(aggCount),
        },
      })
      .catch((err) => {
        logger.error('notify_push_failed', {
          err: err.message,
          type: 'story_like',
        });
      });
  }

  async _createAndPush({
    recipientId,
    actorId,
    type,
    objectType,
    objectId,
    action,
    context = {},
    thumbnailUrl = null,
  }) {
    const actor = actorId ? await this.users.getProfile(actorId) : null;
    const actorName =
      actor?.fullName?.trim() ||
      actor?.username?.trim() ||
      'Birisi';
    const copy = PUSH_COPY[type] || {
      heading: 'Zovi',
      body: () => 'Yeni bildirim',
      messageKey: type,
    };

    const row = await this.notifications.create({
      recipientId,
      actorId,
      type,
      objectType,
      objectId,
      action,
      bodyKey: copy.messageKey,
      thumbnailUrl,
      payload: {
        actorName,
        actorUsername: actor?.username || '',
        placeName: context.placeName || '',
        thumbnailUrl: thumbnailUrl || '',
      },
    });

    const mapped = this.notifications.mapRow(row);

    // Fire-and-forget push — never block the HTTP response path long.
    this.oneSignal
      .sendToUser({
        userId: recipientId,
        heading: copy.heading,
        body: copy.body(actorName, context),
        data: {
          type,
          notificationId: mapped.id,
          actorId: actorId || '',
          objectId: objectId || '',
          action,
          messageKey: copy.messageKey,
          username: actor?.username || '',
          displayName: actorName,
          avatarUrl: actor?.avatarUrl || '',
          placeName: context.placeName || '',
          thumbnailUrl: thumbnailUrl || '',
        },
      })
      .catch((err) => {
        logger.error('notify_push_failed', { err: err.message, type });
      });

    return mapped;
  }

  async listForUser(userId, opts) {
    const rows = await this.notifications.listForUser(userId, opts);
    const items = rows.map((r) => this.notifications.mapRow(r));
    return this._withLiveActions(userId, items);
  }

  /**
   * The stored `action` is only the value at creation time; the relationship
   * can change afterwards (accepted request, follow back from the profile,
   * unfollow). Recompute the CTA against the current follow state so the inbox
   * never offers "follow back" for someone the viewer already follows.
   */
  async _withLiveActions(viewerId, items) {
    const actionable = items.filter(
      (n) =>
        n.actorId &&
        (n.action === 'follow_back' ||
          n.action === 'accept_follow_request' ||
          n.action === 'request_sent'),
    );
    if (actionable.length === 0) return items;

    const actorIds = actionable.map((n) => n.actorId);
    const requestIds = actionable
      .filter((n) => n.objectType === 'follow_request')
      .map((n) => n.objectId);

    const [following, pendingOut, requestStatus] = await Promise.all([
      this.follows.filterFollowing(viewerId, actorIds),
      this.follows.filterPendingOutgoing(viewerId, actorIds),
      this.follows.getRequestStatuses(requestIds),
    ]);

    const resolve = (n) => {
      if (n.action === 'accept_follow_request') {
        const stillPending = requestStatus.get(n.objectId) === 'pending';
        if (stillPending) return 'accept_follow_request';
      }
      if (following.has(n.actorId)) return 'none';
      if (pendingOut.has(n.actorId)) return 'request_sent';
      return 'follow_back';
    };

    return items.map((n) =>
      actionable.includes(n) ? { ...n, action: resolve(n) } : n,
    );
  }
}

module.exports = { NotificationService, PUSH_COPY };
