'use strict';

class MusicTrack {
  constructor(row) {
    this.id = row.id;
    this.slug = row.slug;
    this.title = row.title;
    this.artist = row.artist;
    this.genre = row.genre ?? '';
    this.durationMs = Number(row.duration_ms) || 0;
    this.coverUrl = row.cover_url ?? '';
    this.audioUrl = row.audio_url;
    this.sortOrder = Number(row.sort_order) || 0;
    this.isActive = Boolean(row.is_active);
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new MusicTrack(row);
  }

  toJSON() {
    return {
      id: this.id,
      slug: this.slug,
      title: this.title,
      artist: this.artist,
      genre: this.genre,
      durationMs: this.durationMs,
      coverUrl: this.coverUrl,
      audioUrl: this.audioUrl,
      sortOrder: this.sortOrder,
    };
  }
}

module.exports = { MusicTrack };
