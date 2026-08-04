CREATE TABLE IF NOT EXISTS user_stamps (
  user_id CHAR(36) NOT NULL,
  stamp_id CHAR(36) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'system',
  earned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, stamp_id),
  CONSTRAINT fk_user_stamps_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_stamps_stamp
    FOREIGN KEY (stamp_id) REFERENCES stamps(id) ON DELETE CASCADE,
  KEY idx_user_stamps_earned (user_id, earned_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
