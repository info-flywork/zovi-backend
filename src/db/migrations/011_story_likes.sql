ALTER TABLE stories
  ADD COLUMN like_count INT NOT NULL DEFAULT 0 AFTER view_count;

CREATE TABLE IF NOT EXISTS story_likes (
  story_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (story_id, user_id),
  CONSTRAINT fk_story_likes_story
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_likes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_story_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
