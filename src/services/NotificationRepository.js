'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { localizeMockNameFields } = require('../utils/mockNameI18n');

// Every column `mapRow` reads below — explicit so a future wide/rarely-used
// column added to `notifications` doesn't silently ride along on every
// read. `deleted_at` is deliberately excluded: only ever used in WHERE
// filters, never read back out of a row.
const NOTIFICATION_COLUMNS = `
    n.id, n.recipient_id, n.actor_id, n.type, n.object_type, n.object_id,
    n.thumbnail_url, n.agg_count, n.title_key, n.body_key, n.payload_json,
    n.action, n.created_at, n.read_at`;

class NotificationRepository {
  async create({
    recipientId,
    actorId = null,
    type,
    objectType = null,
    objectId = null,
    thumbnailUrl = null,
    aggCount = null,
    titleKey = null,
    bodyKey = null,
    payload = null,
    action = 'none',
  }) {
    const id = randomUUID();
    await query(
      `INSERT INTO notifications (
         id, recipient_id, actor_id, type, object_type, object_id,
         thumbnail_url, agg_count, title_key, body_key, payload_json, action,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [
        id,
        recipientId,
        actorId,
        type,
        objectType,
        objectId,
        thumbnailUrl,
        aggCount,
        titleKey,
        bodyKey,
        payload ? JSON.stringify(payload) : null,
        action,
      ],
    );
    return this.findById(id);
  }

  async findById(id) {
    const rows = await query(
      `SELECT ${NOTIFICATION_COLUMNS},
              up.full_name AS actor_name,
              up.username AS actor_username,
              up.avatar_url AS actor_avatar_url
       FROM notifications n
       LEFT JOIN user_profiles up ON up.user_id = n.actor_id
       WHERE n.id = ? AND n.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  async listForUser(userId, { limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return query(
      `SELECT ${NOTIFICATION_COLUMNS},
              up.full_name AS actor_name,
              up.username AS actor_username,
              up.avatar_url AS actor_avatar_url
       FROM notifications n
       LEFT JOIN user_profiles up ON up.user_id = n.actor_id
       WHERE n.recipient_id = ?
         AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, safeLimit, safeOffset],
    );
  }

  async markRead(userId, notificationId) {
    const result = await query(
      `UPDATE notifications
       SET read_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND recipient_id = ? AND read_at IS NULL`,
      [notificationId, userId],
    );
    return result.affectedRows > 0;
  }

  async markAllRead(userId) {
    await query(
      `UPDATE notifications
       SET read_at = UTC_TIMESTAMP(3)
       WHERE recipient_id = ? AND read_at IS NULL AND deleted_at IS NULL`,
      [userId],
    );
  }

  async softDelete(userId, notificationId) {
    const result = await query(
      `UPDATE notifications
       SET deleted_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND recipient_id = ? AND deleted_at IS NULL`,
      [notificationId, userId],
    );
    return result.affectedRows > 0;
  }

  /**
   * Latest inbox row for this object if it was touched within the window.
   * `created_at` is bumped on aggregate updates so the window slides.
   */
  async findRecentForObject({
    recipientId,
    type,
    objectType,
    objectId,
    withinSeconds = 60,
  }) {
    const sec = Math.max(1, Math.min(Number(withinSeconds) || 60, 3600));
    // MySQL prepared statements reject `INTERVAL ? SECOND` — interpolate the
    // clamped integer only.
    const rows = await query(
      `SELECT ${NOTIFICATION_COLUMNS}
       FROM notifications n
       WHERE n.recipient_id = ?
         AND n.type = ?
         AND n.object_type = ?
         AND n.object_id = ?
         AND n.deleted_at IS NULL
         AND n.created_at >= (UTC_TIMESTAMP(3) - INTERVAL ${sec} SECOND)
       ORDER BY n.created_at DESC
       LIMIT 1`,
      [recipientId, type, objectType, objectId],
    );
    return rows[0] || null;
  }

  async bumpAggregate({
    id,
    actorId,
    aggCount,
    bodyKey,
    thumbnailUrl = null,
    payload = null,
    action = 'open_story',
  }) {
    await query(
      `UPDATE notifications
       SET actor_id = ?,
           agg_count = ?,
           body_key = ?,
           thumbnail_url = COALESCE(?, thumbnail_url),
           payload_json = ?,
           action = ?,
           created_at = UTC_TIMESTAMP(3),
           read_at = NULL
       WHERE id = ? AND deleted_at IS NULL`,
      [
        actorId,
        aggCount,
        bodyKey,
        thumbnailUrl,
        payload ? JSON.stringify(payload) : null,
        action,
        id,
      ],
    );
    return this.findById(id);
  }

  /**
   * When a follow request is accepted, flip the related inbox row's action
   * from accept_follow_request → follow_back.
   */
  async updateActionForObject({
    recipientId,
    objectType,
    objectId,
    action,
    type,
  }) {
    await query(
      `UPDATE notifications
       SET action = ?,
           type = COALESCE(?, type)
       WHERE recipient_id = ?
         AND object_type = ?
         AND object_id = ?
         AND deleted_at IS NULL`,
      [action, type || null, recipientId, objectType, objectId],
    );
  }

  mapRow(row) {
    if (!row) return null;
    let payload = null;
    if (row.payload_json) {
      try {
        payload =
          typeof row.payload_json === 'string'
            ? JSON.parse(row.payload_json)
            : row.payload_json;
      } catch (_) {
        payload = null;
      }
    }
    return {
      id: row.id,
      recipientId: row.recipient_id,
      actorId: row.actor_id,
      type: row.type,
      objectType: row.object_type,
      objectId: row.object_id,
      thumbnailUrl: row.thumbnail_url,
      aggCount: row.agg_count,
      titleKey: row.title_key,
      bodyKey: row.body_key,
      payload,
      action: row.action || 'none',
      createdAt: row.created_at,
      readAt: row.read_at,
      actor: row.actor_id
        ? localizeMockNameFields({
            userId: row.actor_id,
            name: row.actor_name || '',
            username: row.actor_username || '',
            avatarUrl: row.actor_avatar_url || '',
          })
        : null,
    };
  }
}

module.exports = { NotificationRepository };