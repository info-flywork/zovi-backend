'use strict';

const { ChatRepository } = require('./ChatRepository');
const { FollowRepository } = require('./FollowRepository');
const { UserRepository } = require('./UserRepository');
const { TribeRepository } = require('./TribeRepository');
const { NotificationService } = require('./NotificationService');
const { MockChatService, isMockUserId } = require('./MockChatService');
const { chatTypingStore } = require('./ChatTypingStore');
const { chatRepairCache, chatRepairKey } = require('../cache/appCache');
const { realtimeHub } = require('./RealtimeHub');

class ChatService {
  constructor({
    chat = new ChatRepository(),
    follows = new FollowRepository(),
    users = new UserRepository(),
    tribes = new TribeRepository(),
    notifications = new NotificationService(),
    mockChat = null,
    typing = chatTypingStore,
  } = {}) {
    this.chat = chat;
    this.follows = follows;
    this.users = users;
    this.tribes = tribes;
    this.notifications = notifications;
    this.typing = typing;
    this.mockChat = mockChat || new MockChatService({ chatService: this });
  }

  _httpError(status, code, message) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
  }

  /**
   * On send from `senderId` → `peerId`:
   *   - Sender always lands in inbox (their outgoing thread is normal chat).
   *   - Recipient stays in request unless the sender follows them
   *     (never demote an existing inbox membership).
   */
  async _applySendFolders(conversationId, senderId, peerId) {
    await this.chat.promoteToInbox(conversationId, senderId);
    const senderFollowsPeer = await this.follows.isFollowing(senderId, peerId);
    if (senderFollowsPeer) {
      await this.chat.promoteToInbox(conversationId, peerId);
    }
  }

  async listConversations(userId, { folder, limit, offset } = {}) {
    // Bulk repair is idempotent and only needs to run periodically, not on
    // every poll (client re-lists conversations every ~2s).
    await chatRepairCache.getOrSet(chatRepairKey(userId), async () => {
      await this.chat.promoteAllSenderInboxes(userId);
      return true;
    });
    const rows = await this.chat.listForUser(userId, { folder, limit, offset });
    return rows.map((r) => this.chat.mapConversationRow(r));
  }

  async openDm(viewerId, peerUserId) {
    const peerId = String(peerUserId || '').trim();
    if (!peerId || peerId === viewerId) {
      throw this._httpError(400, 'INVALID_PEER', 'peerUserId required');
    }

    const peer = await this.users.getProfile(peerId);
    if (!peer) {
      throw this._httpError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const blocked = await this.users.isBlockedEitherWay(viewerId, peerId);
    if (blocked) {
      throw this._httpError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const { conversationId } = await this.chat.getOrCreateDm(viewerId, peerId);
    await this.chat.promoteSenderInboxIfNeeded(conversationId, viewerId);
    const row = await this.chat.getConversationForViewer(
      conversationId,
      viewerId,
    );
    return this.chat.mapConversationRow(row);
  }

  async pulseTyping(viewerId, conversationId) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    const profile = await this.users.getProfile(viewerId);
    this.typing.pulse(id, {
      userId: viewerId,
      name: profile?.fullName || profile?.username || '',
      username: profile?.username || '',
      avatarUrl: profile?.avatarUrl || '',
    });
    const others = await this.chat.listOtherMemberIds(id, viewerId);
    for (const memberId of others) {
      realtimeHub.emitToUser(memberId, {
        type: 'typing',
        conversationId: id,
        userId: viewerId,
      });
    }
    return { ok: true };
  }

  async listTyping(viewerId, conversationId) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    return {
      typers: this.typing.list(id, { excludeUserId: viewerId }),
    };
  }

  /** Used by mock AI / internal callers. */
  setTypingPresence(conversationId, user, { ttlMs } = {}) {
    this.typing.pulse(conversationId, user, { ttlMs });
  }

  clearTypingPresence(conversationId, userId) {
    this.typing.clear(conversationId, userId);
  }

  async listMessages(viewerId, conversationId, opts) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    // Repair: anyone who has sent in this thread should see it in inbox.
    await this.chat.promoteSenderInboxIfNeeded(id, viewerId);

    const after = opts?.after ? String(opts.after) : null;
    const rows = await this.chat.listMessages(id, opts);
    if (after) {
      // Incremental poll: already oldest → newest.
      return rows.map((r) => this.chat.mapMessageRow(r));
    }
    // Full page: SQL returns newest-first; flip for the client.
    return rows.reverse().map((r) => this.chat.mapMessageRow(r));
  }

  async listMedia(viewerId, conversationId, opts) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    const rows = await this.chat.listConversationMedia(id, opts);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      mediaUrl: r.mediaUrl || '',
      createdAt: r.createdAt,
    }));
  }

  async acceptConversation(viewerId, conversationId) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    await this.chat.promoteToInbox(id, viewerId);
    const row = await this.chat.getConversationForViewer(id, viewerId);
    return this.chat.mapConversationRow(row);
  }

  async blockConversation(viewerId, conversationId) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    const peerId = await this.chat.getPeerUserId(id, viewerId);
    if (!peerId) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    await this.users.blockUser(viewerId, peerId);
    // Sever follows / pending requests both ways (same as profile block).
    await Promise.all([
      this.follows.deleteFollow(viewerId, peerId),
      this.follows.deleteFollow(peerId, viewerId),
      this.follows.cancelRequest(viewerId, peerId),
      this.follows.cancelRequest(peerId, viewerId),
    ]);
    await this.users.unrestrictUser(viewerId, peerId);
    await this.chat.softDeleteForUser(id, viewerId);
    return { blocked: true, peerUserId: peerId };
  }

  async sendMessage(
    viewerId,
    conversationId,
    { type, body, mediaUrl, replyToMessageId, replyPreview } = {},
  ) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }

    const isDm = await this.chat.isDmConversation(id);
    const others = await this.chat.listOtherMemberIds(id, viewerId);
    if (isDm && others.length === 0) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }

    const safeType = ['text', 'image', 'voice', 'stamp'].includes(type)
      ? type
      : 'text';
    const text = String(body || '').trim();
    const media = String(mediaUrl || '').trim();
    const replyId = String(replyToMessageId || '').trim() || null;
    const replyText = String(replyPreview || '').trim().slice(0, 280) || null;

    if (safeType === 'text' && !text) {
      throw this._httpError(400, 'EMPTY_MESSAGE', 'Message body required');
    }
    if (safeType !== 'text' && !media && !text) {
      throw this._httpError(400, 'EMPTY_MESSAGE', 'Media required');
    }

    if (isDm && others[0]) {
      await this._applySendFolders(id, viewerId, others[0]);
    } else {
      await this.chat.promoteToInbox(id, viewerId);
    }

    const row = await this.chat.insertMessage({
      conversationId: id,
      senderId: viewerId,
      type: safeType,
      body: safeType === 'text' ? text.slice(0, 4000) : text.slice(0, 500),
      mediaUrl: media || null,
      replyToMessageId: replyId,
      replyPreview: replyText,
    });

    this.typing.clear(id, viewerId);

    const mapped = this.chat.mapMessageRow(row);
    const isStoryReply =
      replyText === 'story' ||
      (replyText && replyText.startsWith('story:')) ||
      replyText === 'pulse' ||
      (replyText && replyText.startsWith('pulse:'));
    const preview =
      safeType === 'text'
        ? text.slice(0, 120)
        : safeType === 'image'
          ? 'Fotoğraf'
          : safeType === 'voice'
            ? 'Sesli mesaj'
            : 'Sticker';
    const mediaThumb =
      (safeType === 'image' || isStoryReply) && media ? media : null;

    let isGroup = !isDm;
    let groupName = '';
    let tribeId = '';
    if (isGroup) {
      const tribe = await this.tribes.getByConversationId(id);
      if (tribe) {
        groupName = String(tribe.name || '').trim();
        tribeId = String(tribe.id || '').trim();
      }
    }

    // Fetched once — every recipient's push notification quotes the same
    // sender, so a per-recipient lookup here was N identical queries.
    const senderProfile = await this.users.getProfile(viewerId);

    for (const recipientId of others) {
      // Mock characters have no devices — skip inbox + OneSignal entirely.
      if (isMockUserId(recipientId)) continue;
      let isRequest = false;
      if (isDm) {
        const recipientRow = await this.chat.getConversationForViewer(
          id,
          recipientId,
        );
        isRequest = recipientRow?.folder === 'request';
      }
      this.notifications
        .notifyChatMessage({
          recipientId,
          senderId: viewerId,
          actorProfile: senderProfile,
          conversationId: id,
          preview,
          isRequest,
          isGroup,
          groupName,
          tribeId,
          mediaThumbnailUrl: mediaThumb,
          lastMessageAt: mapped?.createdAt || null,
        })
        .catch(() => {});
      realtimeHub.emitToUser(recipientId, {
        type: 'message:new',
        conversationId: id,
      });
    }

    // Mock characters reply like real people (DM + tribe chats).
    try {
      this.mockChat.maybeAutoReply({
        conversationId: id,
        senderId: viewerId,
        isDm,
        peerIds: others,
        inboundType: safeType,
        inboundBody: text,
      });
    } catch (_) {
      // never block the sender path
    }

    return mapped;
  }

  async markRead(viewerId, conversationId) {
    const id = String(conversationId || '').trim();
    if (!(await this.chat.isMember(id, viewerId))) {
      throw this._httpError(404, 'NOT_FOUND', 'Conversation not found');
    }
    await this.chat.markRead(id, viewerId);
    return { read: true };
  }

  async deleteConversation(viewerId, conversationId) {
    const id = String(conversationId || '').trim();
    const ok = await this.chat.softDeleteForUser(id, viewerId);
    return { deleted: ok };
  }

  async deleteAllRequests(viewerId) {
    const count = await this.chat.softDeleteAllRequests(viewerId);
    return { deleted: count };
  }

  async unreadCount(viewerId) {
    const total = await this.chat.totalUnread(viewerId);
    return { unreadCount: total };
  }
}

module.exports = { ChatService };
