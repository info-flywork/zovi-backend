'use strict';

class StoryDraft {
  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.mediaUrl = row.media_url;
    this.storageKey = row.storage_key;
    this.mediaType = row.media_type || 'image';
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new StoryDraft(row);
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      mediaUrl: this.mediaUrl,
      storageKey: this.storageKey,
      mediaType: this.mediaType,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { StoryDraft };
