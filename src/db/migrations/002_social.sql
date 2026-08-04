-- Social graph (friend requests + friendships)

CREATE TABLE IF NOT EXISTS friend_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  from_user_id CHAR(36) NOT NULL,
  to_user_id CHAR(36) NOT NULL,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  message VARCHAR(280) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  responded_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  KEY idx_friend_req_to_status (to_user_id, status, created_at),
  KEY idx_friend_req_from_status (from_user_id, status, created_at),
  CONSTRAINT fk_friend_req_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_req_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_friend_req_not_self CHECK (from_user_id <> to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friendships (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_low_id CHAR(36) NOT NULL,
  user_high_id CHAR(36) NOT NULL,
  requested_by CHAR(36) NULL,
  created_from_request_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_friendship_pair (user_low_id, user_high_id),
  KEY idx_friendships_low (user_low_id),
  KEY idx_friendships_high (user_high_id),
  CONSTRAINT fk_friendships_low FOREIGN KEY (user_low_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friendships_high FOREIGN KEY (user_high_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_friendship_order CHECK (user_low_id < user_high_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id CHAR(36) NOT NULL,
  blocked_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reason VARCHAR(200) NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
