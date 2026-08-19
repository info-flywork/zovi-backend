CREATE TABLE IF NOT EXISTS profile_view_reveals (
  owner_user_id CHAR(36) NOT NULL,
  viewer_user_id CHAR(36) NOT NULL,
  revealed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_user_id, viewer_user_id),
  CONSTRAINT fk_pvr_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pvr_viewer FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
