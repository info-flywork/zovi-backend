'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { Story } = require('../models/Story');
const { localizeMockNameFields } = require('../utils/mockNameI18n');

const SELECT_WITH_MUSIC = `
  SELECT
    s.*,
    mt.audio_url AS music_audio_url,
    mt.title AS music_title,
    mt.artist AS music_artist,
    mt.cover_url AS music_cover_url
  FROM stories s
  LEFT JOIN music_tracks mt ON mt.id = s.music_track_id
`;

class StoryRepository {
  async create({
    userId,
    mediaUrl,
    storageKey,
    mediaType = 'image',
    audience = 'friends_only',
    musicTrackId = null,
    musicClipStartMs = null,
    musicClipDurationMs = null,
  }) {
    const id = randomUUID();
    await query(
      `INSERT INTO stories (
         id, user_id, media_url, storage_key, media_type, audience,
         music_track_id, music_clip_start_ms, music_clip_duration_ms,
         expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))`,
      [
        id,
        userId,
        mediaUrl,
        storageKey,
        mediaType,
        audience,
        musicTrackId,
        musicClipStartMs,
        musicClipDurationMs,
      ],
    );
    return this.findById(id);
  }

  async findById(id, { viewerUserId = null } = {}) {
    const rows = await query(`${SELECT_WITH_MUSIC} WHERE s.id = ? LIMIT 1`, [
      id,
    ]);
    const story = Story.fromRow(rows[0]);
    if (!story || !viewerUserId) return story;
    await this._attachViewerState([story], viewerUserId);
    return story;
  }

  async _areFriends(userA, userB) {
    if (!userA || !userB || userA === userB) return false;
    const [low, high] = userA < userB ? [userA, userB] : [userB, userA];
    const rows = await query(
      `SELECT id FROM friendships
       WHERE user_low_id = ? AND user_high_id = ?
       LIMIT 1`,
      [low, high],
    );
    return Boolean(rows[0]);
  }

  /** Viewer follows owner (asymmetric). */
  async _viewerFollows(viewerUserId, ownerUserId) {
    if (!viewerUserId || !ownerUserId || viewerUserId === ownerUserId) {
      return true;
    }
    const rows = await query(
      `SELECT 1 FROM follows
       WHERE follower_id = ? AND following_id = ?
       LIMIT 1`,
      [viewerUserId, ownerUserId],
    );
    return Boolean(rows[0]);
  }

  /**
   * Self → all active stories.
   * Viewer follows owner → public + friends_only.
   * Otherwise → public only.
   * Pass `viewerFollows` when already known to skip a second lookup.
   */
  async _audienceSqlForViewer(ownerUserId, viewerUserId, { viewerFollows } = {}) {
    if (!viewerUserId || viewerUserId === ownerUserId) {
      return { clause: '1=1', params: [] };
    }
    const follows =
      typeof viewerFollows === 'boolean'
        ? viewerFollows
        : await this._viewerFollows(viewerUserId, ownerUserId);
    if (follows) {
      return {
        clause: `s.audience IN ('public', 'friends_only')`,
        params: [],
      };
    }
    return { clause: `s.audience = 'public'`, params: [] };
  }

  /**
   * Active (non-deleted, not expired) stories for a user, oldest first (IG order).
   */
  async listActiveByUser(userId, { viewerUserId = null, viewerFollows } = {}) {
    const audience = await this._audienceSqlForViewer(userId, viewerUserId, {
      viewerFollows,
    });
    const rows = await query(
      `${SELECT_WITH_MUSIC}
       WHERE s.user_id = ?
         AND s.deleted_at IS NULL
         AND s.expires_at > UTC_TIMESTAMP(3)
         AND (${audience.clause})
       ORDER BY s.created_at ASC`,
      [userId, ...audience.params],
    );

    const list = rows.map((row) => Story.fromRow(row));
    if (!viewerUserId || list.length === 0) return list;
    await this._attachViewerState(list, viewerUserId);
    return list;
  }

  /**
   * Summary for story ring on home / public profile.
   */
  async getFeedSummaryForUser(userId, viewerUserId, { viewerFollows } = {}) {
    const audience = await this._audienceSqlForViewer(userId, viewerUserId, {
      viewerFollows,
    });
    const rows = await query(
      `SELECT
         s.id,
         CASE WHEN sv.story_id IS NULL THEN 0 ELSE 1 END AS is_viewed
       FROM stories s
       LEFT JOIN story_views sv
         ON sv.story_id = s.id AND sv.viewer_user_id = ?
       WHERE s.user_id = ?
         AND s.deleted_at IS NULL
         AND s.expires_at > UTC_TIMESTAMP(3)
         AND (${audience.clause})
       ORDER BY s.created_at ASC`,
      [viewerUserId, userId, ...audience.params],
    );

    if (rows.length === 0) {
      return { hasStory: false, isViewed: false, storyCount: 0 };
    }

    const allViewed = rows.every(
      (r) => r.is_viewed === 1 || r.is_viewed === true,
    );
    return {
      hasStory: true,
      isViewed: allViewed,
      storyCount: rows.length,
    };
  }

  /**
   * Active stories from users the viewer follows, grouped per author.
   * Unviewed authors first, then most recent activity.
   */
  async listFriendFeed(viewerUserId) {
    const rows = await query(
      `SELECT
         s.*,
         mt.audio_url AS music_audio_url,
         mt.title AS music_title,
         mt.artist AS music_artist,
         mt.cover_url AS music_cover_url,
         COALESCE(up.full_name, '') AS author_name,
         COALESCE(up.username, '') AS author_username,
         COALESCE(up.avatar_url, '') AS author_avatar_url,
         CASE WHEN sv.story_id IS NULL THEN 0 ELSE 1 END AS is_viewed,
         CASE WHEN sl.story_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
       FROM stories s
       INNER JOIN follows f
         ON f.follower_id = ? AND f.following_id = s.user_id
       LEFT JOIN music_tracks mt ON mt.id = s.music_track_id
       LEFT JOIN user_profiles up ON up.user_id = s.user_id
       LEFT JOIN story_views sv
         ON sv.story_id = s.id AND sv.viewer_user_id = ?
       LEFT JOIN story_likes sl
         ON sl.story_id = s.id AND sl.user_id = ?
       WHERE s.deleted_at IS NULL
         AND s.expires_at > UTC_TIMESTAMP(3)
         AND s.user_id <> ?
         AND s.audience IN ('public', 'friends_only')
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = s.user_id)
              OR (b.blocker_id = s.user_id AND b.blocked_id = ?)
         )
       ORDER BY s.created_at ASC`,
      [
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
      ],
    );

    const byUser = new Map();
    for (const row of rows) {
      const story = Story.fromRow(row);
      let group = byUser.get(row.user_id);
      if (!group) {
        group = localizeMockNameFields({
          userId: row.user_id,
          name: row.author_name || row.author_username || '',
          username: row.author_username || '',
          avatarUrl: row.author_avatar_url || '',
          stories: [],
        });
        byUser.set(row.user_id, group);
      }
      group.stories.push(story);
    }

    const groups = [...byUser.values()].map((group) => ({
      ...group,
      hasStory: true,
      isViewed: group.stories.every((s) => s.isViewed),
      storyCount: group.stories.length,
      lastCreatedAt: group.stories[group.stories.length - 1].createdAt,
    }));

    const restrictedIds = await this._listRestrictedIds(viewerUserId);

    groups.sort((a, b) => {
      const aRestricted = restrictedIds.has(a.userId);
      const bRestricted = restrictedIds.has(b.userId);
      if (aRestricted !== bRestricted) return aRestricted ? 1 : -1;
      if (a.isViewed !== b.isViewed) return a.isViewed ? 1 : -1;
      return new Date(b.lastCreatedAt) - new Date(a.lastCreatedAt);
    });

    return groups;
  }

  async _listRestrictedIds(restrictorId) {
    if (!restrictorId) return new Set();
    const rows = await query(
      `SELECT restricted_id FROM restrictions WHERE restrictor_id = ?`,
      [restrictorId],
    );
    return new Set(rows.map((r) => r.restricted_id));
  }

  /**
   * Public discovery feed: every active public story except the viewer's own.
   * Newest first. Blocks applied both ways.
   */
  async listPublicExplore(viewerUserId, { limit = 120 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 120, 1), 200);
    const rows = await query(
      `SELECT
         s.*,
         mt.audio_url AS music_audio_url,
         mt.title AS music_title,
         mt.artist AS music_artist,
         mt.cover_url AS music_cover_url,
         COALESCE(up.full_name, '') AS author_name,
         COALESCE(up.username, '') AS author_username,
         COALESCE(up.avatar_url, '') AS author_avatar_url,
         CASE WHEN sv.story_id IS NULL THEN 0 ELSE 1 END AS is_viewed,
         CASE WHEN sl.story_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
       FROM stories s
       LEFT JOIN music_tracks mt ON mt.id = s.music_track_id
       LEFT JOIN user_profiles up ON up.user_id = s.user_id
       LEFT JOIN story_views sv
         ON sv.story_id = s.id AND sv.viewer_user_id = ?
       LEFT JOIN story_likes sl
         ON sl.story_id = s.id AND sl.user_id = ?
       WHERE s.deleted_at IS NULL
         AND s.expires_at > UTC_TIMESTAMP(3)
         AND s.audience = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = s.user_id)
              OR (b.blocker_id = s.user_id AND b.blocked_id = ?)
         )
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        safeLimit,
      ],
    );

    return rows.map((row) => {
      const localized = localizeMockNameFields({
        userId: row.user_id,
        authorName: row.author_name || row.author_username || '',
        authorUsername: row.author_username || '',
        authorAvatarUrl: row.author_avatar_url || '',
      });
      return {
        story: Story.fromRow(row),
        authorName: localized.authorName,
        authorUsername: localized.authorUsername || row.author_username || '',
        authorAvatarUrl: localized.authorAvatarUrl || row.author_avatar_url || '',
      };
    });
  }

  async markViewed(storyId, viewerUserId) {
    const result = await query(
      `INSERT INTO story_views (story_id, viewer_user_id, viewed_at)
       VALUES (?, ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE viewed_at = viewed_at`,
      [storyId, viewerUserId],
    );

    // Only bump view_count on first view.
    if (result?.affectedRows === 1) {
      await query(
        `UPDATE stories SET view_count = view_count + 1 WHERE id = ?`,
        [storyId],
      );
    }

    return this.findById(storyId, { viewerUserId });
  }

  async like(storyId, userId) {
    const result = await query(
      `INSERT INTO story_likes (story_id, user_id, created_at)
       VALUES (?, ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [storyId, userId],
    );

    // mysql2: insert=1, updated-with-change=2, no-op duplicate=0.
    const affected = Number(result?.affectedRows ?? 0);
    const created = affected === 1;
    if (created) {
      await query(
        `UPDATE stories SET like_count = like_count + 1 WHERE id = ?`,
        [storyId],
      );
    }

    const story = await this.findById(storyId, { viewerUserId: userId });
    return { story, created };
  }

  async unlike(storyId, userId) {
    const result = await query(
      `DELETE FROM story_likes WHERE story_id = ? AND user_id = ?`,
      [storyId, userId],
    );

    if (result?.affectedRows === 1) {
      await query(
        `UPDATE stories
         SET like_count = GREATEST(like_count - 1, 0)
         WHERE id = ?`,
        [storyId],
      );
    }

    return this.findById(storyId, { viewerUserId: userId });
  }

  async softDelete(id, userId) {
    const result = await query(
      `UPDATE stories
       SET deleted_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?
         AND user_id = ?
         AND deleted_at IS NULL`,
      [id, userId],
    );
    return (result?.affectedRows ?? 0) > 0;
  }

  async _attachViewerState(stories, viewerUserId) {
    const ids = stories.map((s) => s.id).filter(Boolean);
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    const [viewedRows, likedRows] = await Promise.all([
      query(
        `SELECT story_id
         FROM story_views
         WHERE viewer_user_id = ?
           AND story_id IN (${placeholders})`,
        [viewerUserId, ...ids],
      ),
      query(
        `SELECT story_id
         FROM story_likes
         WHERE user_id = ?
           AND story_id IN (${placeholders})`,
        [viewerUserId, ...ids],
      ),
    ]);

    const viewed = new Set(viewedRows.map((r) => r.story_id));
    const liked = new Set(likedRows.map((r) => r.story_id));
    for (const story of stories) {
      story.isViewed = viewed.has(story.id);
      story.likedByMe = liked.has(story.id);
    }
  }
}

module.exports = { StoryRepository };