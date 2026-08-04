CREATE TABLE IF NOT EXISTS plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  venue_id CHAR(36) NULL,
  place_name VARCHAR(200) NOT NULL,
  subtitle VARCHAR(200) NULL,
  category ENUM('music','cafe','park','culture','restaurant','other') NULL,
  scheduled_at DATETIME(3) NOT NULL,
  note TEXT NULL,
  show_to_friends TINYINT(1) NOT NULL DEFAULT 1,
  show_to_nearby TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('scheduled','cancelled','done') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  cancelled_at DATETIME(3) NULL,
  KEY idx_plans_user_scheduled (user_id, scheduled_at),
  KEY idx_plans_scheduled_status (scheduled_at, status),
  CONSTRAINT fk_plans_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
