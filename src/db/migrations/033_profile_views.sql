CREATE TABLE IF NOT EXISTS profile_views (
  owner_user_id CHAR(36) NOT NULL,
  viewer_user_id CHAR(36) NOT NULL,
  view_count INT NOT NULL DEFAULT 1,
  first_viewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_viewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_user_id, viewer_user_id),
  CONSTRAINT fk_profile_views_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_views_viewer FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_profile_views_owner_last (owner_user_id, last_viewed_at DESC),
  KEY idx_profile_views_viewer_last (viewer_user_id, last_viewed_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
