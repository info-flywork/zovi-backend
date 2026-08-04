'use strict';

class Story {
  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.mediaUrl = row.media_url;
    this.storageKey = row.storage_key;
    this.mediaType = row.media_type || 'image';
    this.audience = row.audience || 'friends_only';
    this.musicTrackId = row.music_track_id ?? null;
    this.musicClipStartMs =
      row.music_clip_start_ms == null
        ? null
        : Number(row.music_clip_start_ms);
    this.musicClipDurationMs =
      row.music_clip_duration_ms == null
        ? null
        : Number(row.music_clip_duration_ms);
    this.musicAudioUrl = row.music_audio_url ?? null;
    this.musicTitle = row.music_title ?? null;
    this.musicArtist = row.music_artist ?? null;
    this.musicCoverUrl = row.music_cover_url ?? null;
    this.viewCount = Number(row.view_count) || 0;
    this.likeCount = Number(row.like_count) || 0;
    this.createdAt = row.created_at;
    this.expiresAt = row.expires_at;
    this.deletedAt = row.deleted_at ?? null;
    this.isViewed =
      row.is_viewed === true ||
      row.is_viewed === 1 ||
      row.is_viewed === '1';
    this.likedByMe =
      row.liked_by_me === true ||
      row.liked_by_me === 1 ||
      row.liked_by_me === '1';
  }

  static fromRow(row) {
    if (!row) return null;
    return new Story(row);
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      mediaUrl: this.mediaUrl,
      storageKey: this.storageKey,
      mediaType: this.mediaType,
      audience: this.audience,
      musicTrackId: this.musicTrackId,
      musicClipStartMs: this.musicClipStartMs,
      musicClipDurationMs: this.musicClipDurationMs,
      musicAudioUrl: this.musicAudioUrl,
      musicTitle: this.musicTitle,
      musicArtist: this.musicArtist,
      musicCoverUrl: this.musicCoverUrl,
      viewCount: this.viewCount,
      likeCount: this.likeCount,
      likedByMe: this.likedByMe,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      isViewed: this.isViewed,
    };
  }
}

module.exports = { Story };
