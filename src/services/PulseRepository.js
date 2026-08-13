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

  async findById(id) {
    const rows = await query(
      `SELECT * FROM pulses WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return this.mapRow(rows[0]);
  }

  async listForUser(userId, { limit = 60, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = await query(
      `SELECT * FROM pulses
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, safeLimit, safeOffset],
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
         COALESCE(up.avatar_url, '') AS author_avatar_url
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
      [viewerUserId, viewerUserId, safeLimit],
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
