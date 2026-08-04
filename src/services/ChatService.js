'use strict';

const { ChatRepository } = require('./ChatRepository');
const { FollowRepository } = require('./FollowRepository');
const { UserRepository } = require('./UserRepository');
const { OneSignalService } = require('./OneSignalService');
const { logger } = require('../utils/logger');

class ChatService {
  constructor({
    chat = new ChatRepository(),
    follows = new FollowRepository(),
    users = new UserRepository(),
    oneSignal = new OneSignalService(),
  } = {}) {
    this.chat = chat;
    this.follows = follows;
    this.users = users;
    this.oneSignal = oneSignal;
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
    await this.chat.promoteAllSenderInboxes(userId);
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

    const peerId = await this.chat.getPeerUserId(id, viewerId);
    if (!peerId) {
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

    await this._applySendFolders(id, viewerId, peerId);

    const row = await this.chat.insertMessage({
      conversationId: id,
      senderId: viewerId,
      type: safeType,
      body: safeType === 'text' ? text.slice(0, 4000) : text.slice(0, 500),
      mediaUrl: media || null,
      replyToMessageId: replyId,
      replyPreview: replyText,
    });

    const mapped = this.chat.mapMessageRow(row);

    // Fire-and-forget push to the peer.
    const recipientRow = await this.chat.getConversationForViewer(id, peerId);
    const isRequest = recipientRow?.folder === 'request';
    this._pushNewMessage({
      recipientId: peerId,
      senderId: viewerId,
      conversationId: id,
      isRequest,
      lastMessageAt: mapped?.createdAt || null,
      preview:
        safeType === 'text'
          ? text.slice(0, 120)
          : safeType === 'image'
            ? 'Fotoğraf'
            : safeType === 'voice'
              ? 'Sesli mesaj'
              : 'Sticker',
    }).catch(() => {});

    return mapped;
  }

  async _pushNewMessage({
    recipientId,
    senderId,
    conversationId,
    preview,
    isRequest = false,
    lastMessageAt = null,
  }) {
    try {
      const profile = await this.users.getProfile(senderId);
      const name =
        profile?.fullName?.trim() || profile?.username?.trim() || 'Birisi';
      const heading = name;
      const body = isRequest
        ? `${name}: ${preview || 'Mesaj isteği'}`
        : preview || 'Yeni mesaj';
      await this.oneSignal.sendToUser({
        userId: recipientId,
        heading,
        body,
        data: {
          type: isRequest ? 'chat_request' : 'chat_message',
          action: 'open_chat',
          conversationId,
          actorId: senderId,
          username: profile?.username || '',
          displayName: name,
          avatarUrl: profile?.avatarUrl || '',
          folder: isRequest ? 'request' : 'inbox',
          isRequest,
          preview: preview || '',
          lastMessageAt: lastMessageAt || '',
          messageKey: isRequest
            ? 'chat_message_request'
            : 'chat_message_received',
        },
      });
    } catch (err) {
      logger.warn('chat_push_failed', { message: err.message });
    }
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
