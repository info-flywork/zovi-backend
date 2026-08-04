-- Asymmetric follows + notifications inbox

ALTER TABLE user_profiles
  ADD COLUMN followers_count INT NOT NULL DEFAULT 0 AFTER friends_count,
  ADD COLUMN following_count INT NOT NULL DEFAULT 0 AFTER followers_count;

CREATE TABLE IF NOT EXISTS follows (
  follower_id CHAR(36) NOT NULL,
  following_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (follower_id, following_id),
  KEY idx_follows_following (following_id, created_at DESC),
  KEY idx_follows_follower (follower_id, created_at DESC),
  CONSTRAINT fk_follows_follower
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_following
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_follows_not_self CHECK (follower_id <> following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follow_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  from_user_id CHAR(36) NOT NULL,
  to_user_id CHAR(36) NOT NULL,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  responded_at DATETIME(3) NULL,
  KEY idx_follow_req_to_status (to_user_id, status, created_at DESC),
  KEY idx_follow_req_from_status (from_user_id, status, created_at DESC),
  UNIQUE KEY uq_follow_req_pair (from_user_id, to_user_id),
  CONSTRAINT fk_follow_req_from
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_req_to
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_follow_req_not_self CHECK (from_user_id <> to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  recipient_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  type VARCHAR(40) NOT NULL,
  object_type VARCHAR(40) NULL,
  object_id CHAR(36) NULL,
  thumbnail_url TEXT NULL,
  agg_count INT NULL,
  title_key VARCHAR(120) NULL,
  body_key VARCHAR(120) NULL,
  payload_json JSON NULL,
  action VARCHAR(40) NOT NULL DEFAULT 'none',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  KEY idx_notifications_inbox (recipient_id, created_at DESC),
  KEY idx_notifications_unread (recipient_id, read_at, created_at DESC),
  CONSTRAINT fk_notifications_recipient
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
