'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');

class PulseRepository {
  mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      mediaUrl: row.media_url,
      storageKey: row.storage_key,
      mediaType: row.media_type,
      sourceType: row.source_type,
      sourceId: row.source_id || null,
      audience: row.audience,
      placeName: row.place_name || '',
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      caption: row.caption || '',
      likeCount: Number(row.like_count || 0),
      likedByMe: Boolean(row.liked_by_me),
      viewCount: Number(row.view_count || 0),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  async findBySource(sourceType, sourceId) {
    if (!sourceType || !sourceId) return null;
    const rows = await query(
      `SELECT * FROM pulses
       WHERE source_type = ? AND source_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [sourceType, sourceId],
    );
    return this.mapRow(rows[0]);
  }

  async create({
    userId,
    mediaUrl,
    storageKey,
    mediaType = 'image',
    sourceType = 'direct',
    sourceId = null,
    audience = 'public',
    placeName = null,
    lat = null,
    lng = null,
    caption = null,
    expiresInHours = 24 * 365,
  }) {
    if (sourceType && sourceId) {
      const existing = await this.findBySource(sourceType, sourceId);
      if (existing) return existing;
    }

    const id = randomUUID();
    const safeAudience =
      audience === 'friends_only' ? 'friends_only' : 'public';
    const hours = Math.max(1, Number(expiresInHours) || 24 * 365);

    await query(
      `INSERT INTO pulses (
         id, user_id, media_url, storage_key, media_type,
         source_type, source_id, audience, place_name, lat, lng, caption,
         expires_at
       ) VALUES (
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?,
         DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? HOUR)
       )`,
      [
        id,
        userId,
        mediaUrl,
        storageKey,
        mediaType === 'video' ? 'video' : 'image',
        sourceType || 'direct',
        sourceId || null,
        safeAudience,
        placeName || null,
        lat,
        lng,
        caption || null,
        hours,
      ],
    );

    return this.findById(id);
  }

  async findById(id, { viewerUserId = null } = {}) {
    const rows = await query(
      `SELECT
         p.*,
         EXISTS(
           SELECT 1 FROM pulse_likes pl
           WHERE pl.pulse_id = p.id AND pl.user_id = ?
         ) AS liked_by_me
       FROM pulses p
       WHERE p.id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [viewerUserId || '', id],
    );
    return this.mapRow(rows[0]);
  }

  async like(pulseId, userId) {
    const result = await query(
      `INSERT INTO pulse_likes (pulse_id, user_id, created_at)
       VALUES (?, ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [pulseId, userId],
    );
    const affected = Number(result?.affectedRows ?? 0);
    const created = affected === 1;
    if (created) {
      await query(
        `UPDATE pulses SET like_count = like_count + 1 WHERE id = ?`,
        [pulseId],
      );
    }
    const pulse = await this.findById(pulseId, { viewerUserId: userId });
    return { pulse, created };
  }

  async unlike(pulseId, userId) {
    const result = await query(
      `DELETE FROM pulse_likes WHERE pulse_id = ? AND user_id = ?`,
      [pulseId, userId],
    );
    if (result?.affectedRows === 1) {
      await query(
        `UPDATE pulses
         SET like_count = GREATEST(like_count - 1, 0)
         WHERE id = ?`,
        [pulseId],
      );
    }
    return this.findById(pulseId, { viewerUserId: userId });
  }

  async listForUser(userId, { limit = 60, offset = 0, viewerUserId = null } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const viewer = viewerUserId || userId;
    const rows = await query(
      `SELECT
         p.*,
         EXISTS(
           SELECT 1 FROM pulse_likes pl
           WHERE pl.pulse_id = p.id AND pl.user_id = ?
         ) AS liked_by_me
       FROM pulses p
       WHERE p.user_id = ? AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [viewer, userId, safeLimit, safeOffset],
    );
    return rows.map((r) => this.mapRow(r));
  }

  async listPublicExplore(viewerUserId, { limit = 120 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 120, 1), 200);
    const rows = await query(
      `SELECT
         p.*,
         COALESCE(up.full_name, '') AS author_name,
         COALESCE(up.username, '') AS author_username,
         COALESCE(up.avatar_url, '') AS author_avatar_url,
         EXISTS(
           SELECT 1 FROM pulse_likes pl
           WHERE pl.pulse_id = p.id AND pl.user_id = ?
         ) AS liked_by_me
       FROM pulses p
       LEFT JOIN user_profiles up ON up.user_id = p.user_id
       WHERE p.deleted_at IS NULL
         AND (p.expires_at IS NULL OR p.expires_at > UTC_TIMESTAMP(3))
         AND p.audience = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id)
              OR (b.blocker_id = p.user_id AND b.blocked_id = ?)
         )
       ORDER BY p.created_at DESC
       LIMIT ?`,
      [viewerUserId, viewerUserId, viewerUserId, safeLimit],
    );

    return rows.map((row) => ({
      ...this.mapRow(row),
      authorName: row.author_name || row.author_username || '',
      authorUsername: row.author_username || '',
      authorAvatarUrl: row.author_avatar_url || '',
    }));
  }
}

module.exports = { PulseRepository };
