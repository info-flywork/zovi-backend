-- Check-in + coin rules + titles + Snapchat-style pair streaks

CREATE TABLE IF NOT EXISTS venues (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'other',
  subtitle VARCHAR(200) NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  place_key VARCHAR(255) NOT NULL,
  people_count_cache INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_venues_place_key (place_key),
  KEY idx_venues_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS check_ins (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  venue_id CHAR(36) NULL,
  place_name VARCHAR(200) NOT NULL,
  caption VARCHAR(160) NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  photo_privacy ENUM('public','friends') NOT NULL DEFAULT 'public',
  coins_earned INT NOT NULL DEFAULT 0,
  is_venue_founder TINYINT(1) NOT NULL DEFAULT 0,
  is_first_ever TINYINT(1) NOT NULL DEFAULT 0,
  is_active_on_map TINYINT(1) NOT NULL DEFAULT 1,
  checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  CONSTRAINT fk_check_ins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_check_ins_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
  KEY idx_check_ins_user_time (user_id, checked_at DESC),
  KEY idx_check_ins_venue_time (venue_id, checked_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS check_in_tags (
  check_in_id CHAR(36) NOT NULL,
  tagged_user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (check_in_id, tagged_user_id),
  CONSTRAINT fk_check_in_tags_ci FOREIGN KEY (check_in_id) REFERENCES check_ins(id) ON DELETE CASCADE,
  CONSTRAINT fk_check_in_tags_user FOREIGN KEY (tagged_user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_check_in_tags_user (tagged_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coin_reward_rules (
  code VARCHAR(64) NOT NULL PRIMARY KEY,
  coins INT NOT NULL,
  message_key VARCHAR(120) NOT NULL,
  icon_key VARCHAR(64) NOT NULL DEFAULT 'coin',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coin_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(64) NOT NULL,
  source_type VARCHAR(40) NULL,
  source_id CHAR(36) NULL,
  balance_after INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_coin_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_coin_tx_user_time (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS titles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  label_key VARCHAR(120) NULL,
  emoji VARCHAR(16) NULL,
  image_url TEXT NULL,
  stamp_slug VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_titles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_titles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title_id CHAR(36) NOT NULL,
  source_check_in_id CHAR(36) NULL,
  unlocked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_titles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_titles_title FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_titles (user_id, title_id),
  KEY idx_user_titles_user (user_id, unlocked_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Snapchat-style shared streak between two users (ordered pair).
CREATE TABLE IF NOT EXISTS friendship_streaks (
  user_low_id CHAR(36) NOT NULL,
  user_high_id CHAR(36) NOT NULL,
  streak_count INT NOT NULL DEFAULT 0,
  last_check_in_id CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_low_id, user_high_id),
  CONSTRAINT fk_fs_low FOREIGN KEY (user_low_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fs_high FOREIGN KEY (user_high_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_fs_low (user_low_id, streak_count DESC),
  KEY idx_fs_high (user_high_id, streak_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO coin_reward_rules (code, coins, message_key, icon_key, sort_order) VALUES
  ('first_ever', 50, 'check_in_success_congrats', 'balloon', 10),
  ('first_at_venue', 30, 'check_in_success_first_at_place', 'location', 20),
  ('first_among_friends', 5, 'check_in_success_first_friend', 'award', 30),
  ('with_photo', 5, 'check_in_success_great_photo', 'camera', 40),
  ('explore', 5, 'check_in_success_explore', 'flame', 50),
  ('with_friend', 5, 'check_in_success_with_friend', 'friends', 60)
ON DUPLICATE KEY UPDATE
  coins = VALUES(coins),
  message_key = VALUES(message_key),
  icon_key = VALUES(icon_key),
  sort_order = VALUES(sort_order);

INSERT INTO titles (id, slug, label, label_key, emoji, stamp_slug)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'founder_king',
  'Kurucu Kral',
  'title_founder_king',
  '👑',
  'founder'
)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  stamp_slug = VALUES(stamp_slug);
