CREATE TABLE IF NOT EXISTS stories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  media_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  media_type ENUM('image','video') NOT NULL DEFAULT 'image',
  audience ENUM('public','friends_only') NOT NULL DEFAULT 'friends_only',
  music_track_id CHAR(36) NULL,
  music_clip_start_ms INT NULL,
  music_clip_duration_ms INT NULL,
  view_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  CONSTRAINT fk_stories_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stories_music
    FOREIGN KEY (music_track_id) REFERENCES music_tracks(id) ON DELETE SET NULL,
  KEY idx_stories_user_created (user_id, created_at),
  KEY idx_stories_expires (expires_at),
  KEY idx_stories_audience_created (audience, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS story_views (
  story_id CHAR(36) NOT NULL,
  viewer_user_id CHAR(36) NOT NULL,
  viewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (story_id, viewer_user_id),
  CONSTRAINT fk_story_views_story
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_views_viewer
    FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_story_views_viewer (viewer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
