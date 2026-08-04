'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { StoryDraft } = require('../models/StoryDraft');

class StoryDraftRepository {
  async create({
    id,
    userId,
    mediaUrl,
    storageKey,
    mediaType = 'image',
  }) {
    const draftId = id || randomUUID();
    await query(
      `INSERT INTO story_drafts
        (id, user_id, media_url, storage_key, media_type)
       VALUES (?, ?, ?, ?, ?)`,
      [draftId, userId, mediaUrl, storageKey, mediaType],
    );
    return this.findById(draftId, userId);
  }

  async findById(id, userId) {
    const rows = await query(
      `SELECT *
       FROM story_drafts
       WHERE id = ?
         AND user_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [id, userId],
    );
    return StoryDraft.fromRow(rows[0]);
  }

  async listByUser(userId, { limit = 60 } = {}) {
    const capped = Math.min(Math.max(Number(limit) || 60, 1), 120);
    const rows = await query(
      `SELECT *
       FROM story_drafts
       WHERE user_id = ?
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ${capped}`,
      [userId],
    );
    return rows.map((row) => StoryDraft.fromRow(row));
  }

  async softDelete(id, userId) {
    const result = await query(
      `UPDATE story_drafts
       SET deleted_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?
         AND user_id = ?
         AND deleted_at IS NULL`,
      [id, userId],
    );
    return (result?.affectedRows ?? 0) > 0;
  }
}

module.exports = { StoryDraftRepository };
