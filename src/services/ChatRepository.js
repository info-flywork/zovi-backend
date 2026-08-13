'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/database');

class ChatRepository {
  orderedPair(userId1, userId2) {
    return userId1 < userId2
      ? { userA: userId1, userB: userId2 }
      : { userA: userId2, userB: userId1 };
  }

  async findDmConversationId(userId1, userId2) {
    const { userA, userB } = this.orderedPair(userId1, userId2);
    const rows = await query(
      `SELECT conversation_id AS conversationId
       FROM dm_pairs
       WHERE user_a = ? AND user_b = ?
       LIMIT 1`,
      [userA, userB],
    );
    return rows[0]?.conversationId || null;
  }

  async createDmConversation(userId1, userId2) {
    const id = randomUUID();
    const { userA, userB } = this.orderedPair(userId1, userId2);

    await withTransaction(async (conn) => {
      await conn.execute(`INSERT INTO conversations (id) VALUES (?)`, [id]);
      await conn.execute(
        `INSERT INTO dm_pairs (user_a, user_b, conversation_id) VALUES (?, ?, ?)`,
        [userA, userB, id],
      );
      await conn.execute(
        `INSERT INTO conversation_members (conversation_id, user_id, folder)
         VALUES (?, ?, 'request')`,
        [id, userId1],
      );
      await conn.execute(
        `INSERT INTO conversation_members (conversation_id, user_id, folder)
         VALUES (?, ?, 'request')`,
        [id, userId2],
      );
    });

    return id;
  }

  async getOrCreateDm(userId1, userId2) {
    const existing = await this.findDmConversationId(userId1, userId2);
    if (existing) {
      // Undelete if either side had soft-deleted the thread.
      await query(
        `UPDATE conversation_members
         SET deleted_at = NULL
         WHERE conversation_id = ? AND user_id IN (?, ?)`,
        [existing, userId1, userId2],
      );
      return { conversationId: existing, created: false };
    }
    try {
      const id = await this.createDmConversation(userId1, userId2);
      return { conversationId: id, created: true };
    } catch (err) {
      // Race: another request created the pair.
      if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
        const again = await this.findDmConversationId(userId1, userId2);
        if (again) return { conversationId: again, created: false };
      }
      throw err;
    }
  }

  async isMember(conversationId, userId) {
    const rows = await query(
      `SELECT 1 FROM conversation_members
       WHERE conversation_id = ? AND user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [conversationId, userId],
    );
    return Boolean(rows[0]);
  }

  async getPeerUserId(conversationId, viewerId) {
    const rows = await query(
      `SELECT user_id AS userId FROM conversation_members
       WHERE conversation_id = ? AND user_id <> ?
       LIMIT 1`,
      [conversationId, viewerId],
    );
    return rows[0]?.userId || null;
  }

  async listForUser(userId, { folder = 'inbox', limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const safeFolder = folder === 'request' ? 'request' : 'inbox';

    return query(
      `SELECT
         c.id AS conversationId,
         c.last_message_at AS lastMessageAt,
         c.last_message_preview AS lastMessagePreview,
         c.last_message_sender_id AS lastMessageSenderId,
         m.folder AS folder,
         m.unread_count AS unreadCount,
         IF(dp.conversation_id IS NULL, '', COALESCE(peer.user_id, '')) AS peerUserId,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(t.name, ''),
           COALESCE(up.full_name, up.username, '')
         ) AS peerName,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(t.name, ''),
           COALESCE(up.username, '')
         ) AS peerUsername,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(
             (
               SELECT up2.avatar_url
               FROM tribe_members tm
               INNER JOIN user_profiles up2 ON up2.user_id = tm.user_id
               WHERE tm.tribe_id = t.id
                 AND tm.state = 'member'
                 AND up2.avatar_url IS NOT NULL
                 AND TRIM(up2.avatar_url) <> ''
               ORDER BY tm.joined_at DESC, tm.created_at DESC
               LIMIT 1
             ),
             ''
           ),
           COALESCE(up.avatar_url, '')
         ) AS peerAvatarUrl,
         IF(dp.conversation_id IS NULL, 1, 0) AS isGroup,
         COALESCE(t.id, '') AS tribeId,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(
             NULLIF(t.member_count_cache, 0),
             (
               SELECT COUNT(*)
               FROM tribe_members tm_count
               WHERE tm_count.tribe_id = t.id
                 AND tm_count.state = 'member'
             ),
             0
           ),
           0
         ) AS memberCount
       FROM conversation_members m
       INNER JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN dm_pairs dp ON dp.conversation_id = c.id
       LEFT JOIN tribes t ON t.conversation_id = c.id
       LEFT JOIN conversation_members peer
         ON peer.conversation_id = m.conversation_id
        AND peer.user_id <> m.user_id
        AND dp.conversation_id IS NOT NULL
       LEFT JOIN user_profiles up ON up.user_id = peer.user_id
       WHERE m.user_id = ?
         AND m.folder = ?
         AND m.deleted_at IS NULL
         AND c.last_message_at IS NOT NULL
       ORDER BY c.last_message_at DESC
       LIMIT ? OFFSET ?`,
      [userId, safeFolder, safeLimit, safeOffset],
    );
  }

  async getConversationForViewer(conversationId, viewerId) {
    const rows = await query(
      `SELECT
         c.id AS conversationId,
         c.last_message_at AS lastMessageAt,
         c.last_message_preview AS lastMessagePreview,
         c.last_message_sender_id AS lastMessageSenderId,
         m.folder AS folder,
         m.unread_count AS unreadCount,
         IF(dp.conversation_id IS NULL, '', COALESCE(peer.user_id, '')) AS peerUserId,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(t.name, ''),
           COALESCE(up.full_name, up.username, '')
         ) AS peerName,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(t.name, ''),
           COALESCE(up.username, '')
         ) AS peerUsername,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(
             (
               SELECT up2.avatar_url
               FROM tribe_members tm
               INNER JOIN user_profiles up2 ON up2.user_id = tm.user_id
               WHERE tm.tribe_id = t.id
                 AND tm.state = 'member'
                 AND up2.avatar_url IS NOT NULL
                 AND TRIM(up2.avatar_url) <> ''
               ORDER BY tm.joined_at DESC, tm.created_at DESC
               LIMIT 1
             ),
             ''
           ),
           COALESCE(up.avatar_url, '')
         ) AS peerAvatarUrl,
         IF(dp.conversation_id IS NULL, 1, 0) AS isGroup,
         COALESCE(t.id, '') AS tribeId,
         IF(
           dp.conversation_id IS NULL,
           COALESCE(
             NULLIF(t.member_count_cache, 0),
             (
               SELECT COUNT(*)
               FROM tribe_members tm_count
               WHERE tm_count.tribe_id = t.id
                 AND tm_count.state = 'member'
             ),
             0
           ),
           0
         ) AS memberCount
       FROM conversation_members m
       INNER JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN dm_pairs dp ON dp.conversation_id = c.id
       LEFT JOIN tribes t ON t.conversation_id = c.id
       LEFT JOIN conversation_members peer
         ON peer.conversation_id = m.conversation_id
        AND peer.user_id <> m.user_id
        AND dp.conversation_id IS NOT NULL
       LEFT JOIN user_profiles up ON up.user_id = peer.user_id
       WHERE m.conversation_id = ?
         AND m.user_id = ?
         AND m.deleted_at IS NULL
       LIMIT 1`,
      [conversationId, viewerId],
    );
    return rows[0] || null;
  }

  /**
   * Promote to inbox. Never demote an accepted/primary thread back to request.
   */
  async promoteToInbox(conversationId, userId) {
    await query(
      `UPDATE conversation_members
       SET folder = 'inbox'
       WHERE conversation_id = ? AND user_id = ? AND folder <> 'inbox'`,
      [conversationId, userId],
    );
  }

  async setMemberFolder(conversationId, userId, folder) {
    const safe = folder === 'inbox' ? 'inbox' : 'request';
    await query(
      `UPDATE conversation_members
       SET folder = ?
       WHERE conversation_id = ? AND user_id = ?`,
      [safe, conversationId, userId],
    );
  }

  async insertMessage({
    conversationId,
    senderId,
    type,
    body,
    mediaUrl,
    replyToMessageId = null,
    replyPreview = null,
  }) {
    const id = randomUUID();
    const preview =
      type === 'text'
        ? String(body || '').slice(0, 280)
        : type === 'image'
          ? 'Fotoğraf'
          : type === 'voice'
            ? 'Sesli mesaj'
            : type === 'stamp'
              ? 'Sticker'
              : '';
    const replyId = replyToMessageId ? String(replyToMessageId).trim() : null;
    const replyText = replyPreview
      ? String(replyPreview).trim().slice(0, 280)
      : null;

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO messages (
           id, conversation_id, sender_id, type, body, media_url,
           reply_to_message_id, reply_preview
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          conversationId,
          senderId,
          type,
          body || null,
          mediaUrl || null,
          replyId || null,
          replyText || null,
        ],
      );
      await conn.execute(
        `UPDATE conversations
         SET last_message_at = UTC_TIMESTAMP(3),
             last_message_preview = ?,
             last_message_sender_id = ?
         WHERE id = ?`,
        [preview, senderId, conversationId],
      );
      await conn.execute(
        `UPDATE conversation_members
         SET unread_count = unread_count + 1,
             deleted_at = NULL
         WHERE conversation_id = ? AND user_id <> ?`,
        [conversationId, senderId],
      );
      await conn.execute(
        `UPDATE conversation_members
         SET deleted_at = NULL
         WHERE conversation_id = ? AND user_id = ?`,
        [conversationId, senderId],
      );
    });

    return this.findMessageById(id);
  }

  async findMessageById(id) {
    const rows = await query(
      `SELECT
         m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
         m.type, m.body, m.media_url AS mediaUrl,
         m.reply_to_message_id AS replyToMessageId,
         m.reply_preview AS replyPreview,
         m.created_at AS createdAt,
         up.full_name AS senderName,
         up.username AS senderUsername,
         up.avatar_url AS senderAvatarUrl
       FROM messages m
       LEFT JOIN user_profiles up ON up.user_id = m.sender_id
       WHERE m.id = ? AND m.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  /**
   * If this user has ever sent a message in the conversation, keep them in
   * inbox (outgoing threads are never message requests).
   */
  async promoteSenderInboxIfNeeded(conversationId, userId) {
    const rows = await query(
      `SELECT 1 FROM messages
       WHERE conversation_id = ?
         AND sender_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [conversationId, userId],
    );
    if (!rows[0]) return;
    await this.promoteToInbox(conversationId, userId);
  }

  /** Bulk repair for list endpoints — senders should never sit in request. */
  async promoteAllSenderInboxes(userId) {
    await query(
      `UPDATE conversation_members m
       INNER JOIN messages msg
         ON msg.conversation_id = m.conversation_id
        AND msg.sender_id = m.user_id
        AND msg.deleted_at IS NULL
       SET m.folder = 'inbox'
       WHERE m.user_id = ?
         AND m.folder = 'request'
         AND m.deleted_at IS NULL`,
      [userId],
    );
  }

  async listMessages(
    conversationId,
    { limit = 50, before = null, after = null } = {},
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const select = `SELECT
         m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
         m.type, m.body, m.media_url AS mediaUrl,
         m.reply_to_message_id AS replyToMessageId,
         m.reply_preview AS replyPreview,
         m.created_at AS createdAt,
         up.full_name AS senderName,
         up.username AS senderUsername,
         up.avatar_url AS senderAvatarUrl
       FROM messages m
       LEFT JOIN user_profiles up ON up.user_id = m.sender_id`;
    if (after) {
      return query(
        `${select}
         WHERE m.conversation_id = ?
           AND m.deleted_at IS NULL
           AND m.created_at > ?
         ORDER BY m.created_at ASC
         LIMIT ?`,
        [conversationId, after, safeLimit],
      );
    }
    if (before) {
      return query(
        `${select}
         WHERE m.conversation_id = ?
           AND m.deleted_at IS NULL
           AND m.created_at < ?
         ORDER BY m.created_at DESC
         LIMIT ?`,
        [conversationId, before, safeLimit],
      );
    }
    return query(
      `${select}
       WHERE m.conversation_id = ?
         AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [conversationId, safeLimit],
    );
  }

  async listOtherMemberIds(conversationId, userId) {
    const rows = await query(
      `SELECT user_id AS userId FROM conversation_members
       WHERE conversation_id = ? AND user_id <> ? AND deleted_at IS NULL`,
      [conversationId, userId],
    );
    return rows.map((r) => String(r.userId));
  }

  async listConversationMedia(
    conversationId,
    { limit = 100, offset = 0 } = {},
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = await query(
      `SELECT m.id, m.type, m.media_url AS mediaUrl, m.created_at AS createdAt
       FROM messages m
       WHERE m.conversation_id = ?
         AND m.deleted_at IS NULL
         AND m.media_url IS NOT NULL
         AND TRIM(m.media_url) <> ''
         AND m.type IN ('image', 'stamp')
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [conversationId, safeLimit, safeOffset],
    );
    return rows.map((r) => ({
      id: String(r.id),
      type: String(r.type || 'image'),
      mediaUrl: String(r.mediaUrl || '').trim(),
      createdAt: r.createdAt,
    }));
  }

  async isDmConversation(conversationId) {
    const rows = await query(
      `SELECT 1 FROM dm_pairs WHERE conversation_id = ? LIMIT 1`,
      [conversationId],
    );
    return Boolean(rows[0]);
  }

  async markRead(conversationId, userId) {
    await query(
      `UPDATE conversation_members
       SET unread_count = 0,
           last_read_at = UTC_TIMESTAMP(3)
       WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId],
    );
  }

  async softDeleteForUser(conversationId, userId) {
    const result = await query(
      `UPDATE conversation_members
       SET deleted_at = UTC_TIMESTAMP(3),
           unread_count = 0,
           folder = 'inbox'
       WHERE conversation_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [conversationId, userId],
    );
    return result.affectedRows > 0;
  }

  async softDeleteAllRequests(userId) {
    const result = await query(
      `UPDATE conversation_members
       SET deleted_at = UTC_TIMESTAMP(3),
           unread_count = 0
       WHERE user_id = ? AND folder = 'request' AND deleted_at IS NULL`,
      [userId],
    );
    return result.affectedRows || 0;
  }

  async totalUnread(userId) {
    const rows = await query(
      `SELECT COALESCE(SUM(unread_count), 0) AS total
       FROM conversation_members
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId],
    );
    return Number(rows[0]?.total || 0);
  }

  mapConversationRow(row) {
    if (!row) return null;
    return {
      id: row.conversationId,
      folder: row.folder,
      unreadCount: Number(row.unreadCount || 0),
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview || '',
      lastMessageSenderId: row.lastMessageSenderId || null,
      peer: {
        userId: row.peerUserId,
        name: row.peerName || '',
        username: row.peerUsername || '',
        avatarUrl: row.peerAvatarUrl || '',
        isGroup: Boolean(row.isGroup),
        tribeId: row.tribeId || '',
        memberCount: Number(row.memberCount || 0),
      },
    };
  }

  mapMessageRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      type: row.type,
      body: row.body || '',
      mediaUrl: row.mediaUrl || '',
      replyToMessageId: row.replyToMessageId || null,
      replyPreview: row.replyPreview || '',
      createdAt: row.createdAt,
      senderName: row.senderName || row.senderUsername || '',
      senderUsername: row.senderUsername || '',
      senderAvatarUrl: row.senderAvatarUrl || '',
    };
  }
}

module.exports = { ChatRepository };
