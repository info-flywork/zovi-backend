CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  reason TEXT NULL,
  status ENUM('pending','processing','cancelled','completed') NOT NULL DEFAULT 'pending',
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  scheduled_purge_at DATETIME(3) NULL,
  processed_at DATETIME(3) NULL,
  KEY idx_deletion_status_purge (status, scheduled_purge_at),
  KEY idx_deletion_user_id (user_id),
  CONSTRAINT fk_deletion_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
