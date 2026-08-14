CREATE TABLE IF NOT EXISTS pulse_likes (
  pulse_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (pulse_id, user_id),
  CONSTRAINT fk_pulse_likes_pulse
    FOREIGN KEY (pulse_id) REFERENCES pulses(id) ON DELETE CASCADE,
  CONSTRAINT fk_pulse_likes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_pulse_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
