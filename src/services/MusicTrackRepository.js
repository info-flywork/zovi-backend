'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { MusicTrack } = require('../models/MusicTrack');

class MusicTrackRepository {
  async list({ q = '', limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const fetchLimit = safeLimit + 1;
    const term = String(q || '').trim();

    let rows;
    if (!term) {
      rows = await query(
        `SELECT *
         FROM music_tracks
         WHERE is_active = 1
         ORDER BY sort_order ASC, created_at ASC
         LIMIT ? OFFSET ?`,
        [fetchLimit, safeOffset],
      );
    } else {
      const like = `%${term.replace(/[%_]/g, '')}%`;
      rows = await query(
        `SELECT *
         FROM music_tracks
         WHERE is_active = 1
           AND (
             title LIKE ?
             OR artist LIKE ?
             OR genre LIKE ?
             OR slug LIKE ?
           )
         ORDER BY sort_order ASC, created_at ASC
         LIMIT ? OFFSET ?`,
        [like, like, like, like, fetchLimit, safeOffset],
      );
    }

    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const tracks = pageRows.map((row) => MusicTrack.fromRow(row));
    return {
      tracks,
      hasMore,
      nextOffset: safeOffset + tracks.length,
    };
  }

  async nextSortOrder() {
    const rows = await query(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM music_tracks`,
    );
    return Number(rows[0]?.max_sort) || 0;
  }

  /**
   * Insert Suno-mapped tracks. Skips existing slugs.
   * @param {Array<{ slug: string, title: string, artist: string, genre: string, durationMs: number, coverUrl: string, audioUrl: string }>} tracks
   * @returns {Promise<{ inserted: number, skipped: number }>}
   */
  async insertFromSuno(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { inserted: 0, skipped: 0 };
    }

    let sortOrder = await this.nextSortOrder();
    let inserted = 0;
    let skipped = 0;

    for (const track of tracks) {
      const slug = String(track.slug || '').trim().slice(0, 64);
      const audioUrl = String(track.audioUrl || '').trim();
      if (!slug || !audioUrl) {
        skipped += 1;
        continue;
      }

      const existing = await query(
        `SELECT id FROM music_tracks WHERE slug = ? LIMIT 1`,
        [slug],
      );
      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      sortOrder += 1;
      await query(
        `INSERT INTO music_tracks (
           id, slug, title, artist, genre, duration_ms,
           cover_url, audio_url, sort_order, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          randomUUID(),
          slug,
          String(track.title || 'Untitled').slice(0, 200),
          String(track.artist || 'Suno AI').slice(0, 200),
          String(track.genre || '').slice(0, 80) || null,
          Math.max(0, Number(track.durationMs) || 0),
          String(track.coverUrl || '').trim() || null,
          audioUrl,
          sortOrder,
        ],
      );
      inserted += 1;
    }

    return { inserted, skipped };
  }
}

module.exports = { MusicTrackRepository };
