-- Profile pulse archive: every shared photo (except avatar) lands here.
CREATE TABLE IF NOT EXISTS pulses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  media_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  media_type ENUM('image','video') NOT NULL DEFAULT 'image',
  -- story | check_in | direct | chat (chat reserved; not auto-mirrored)
  source_type VARCHAR(32) NOT NULL DEFAULT 'direct',
  source_id CHAR(36) NULL,
  audience ENUM('public','friends_only') NOT NULL DEFAULT 'public',
  place_name VARCHAR(200) NULL,
  lat DOUBLE NULL,
  lng DOUBLE NULL,
  caption TEXT NULL,
  like_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  CONSTRAINT fk_pulses_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_pulses_source (source_type, source_id),
  KEY idx_pulses_user_created (user_id, created_at DESC),
  KEY idx_pulses_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
