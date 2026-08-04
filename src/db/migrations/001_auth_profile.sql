-- Zovi MySQL bootstrap (auth + profile core)
-- Adapted from docs/database-schema.md (Postgres → MySQL)

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL,
  phone_e164 VARCHAR(20) NULL,
  email VARCHAR(255) NULL,
  password_hash TEXT NULL,
  primary_auth ENUM('phone','google','apple') NOT NULL,
  phone_verified_at DATETIME(3) NULL,
  email_verified_at DATETIME(3) NULL,
  status ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_users_firebase_uid (firebase_uid),
  UNIQUE KEY uq_users_phone (phone_e164),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status),
  KEY idx_users_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_identities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider ENUM('google','apple') NOT NULL,
  subject VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  raw_profile JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_oauth_provider_subject (provider, subject),
  KEY idx_oauth_user_id (user_id),
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  access_jti VARCHAR(64) NULL,
  device_id VARCHAR(128) NULL,
  device_name VARCHAR(120) NULL,
  platform ENUM('ios','android','web','unknown') NOT NULL DEFAULT 'unknown',
  app_version VARCHAR(32) NULL,
  ip VARCHAR(45) NULL,
  user_agent TEXT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  KEY idx_sessions_user_id (user_id),
  KEY idx_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_onboarding_flags (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  intro_done TINYINT(1) NOT NULL DEFAULT 0,
  onboarding_done TINYINT(1) NOT NULL DEFAULT 0,
  notification_permission ENUM('unknown','granted','denied') NOT NULL DEFAULT 'unknown',
  location_permission ENUM('unknown','granted','denied') NOT NULL DEFAULT 'unknown',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_onboarding_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(50) NOT NULL DEFAULT '',
  username VARCHAR(25) NULL,
  avatar_url TEXT NULL,
  avatar_storage_key TEXT NULL,
  avatar_blurhash VARCHAR(64) NULL,
  bio VARCHAR(150) NULL,
  location_text VARCHAR(120) NULL,
  birth_date DATE NULL,
  gender VARCHAR(32) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  account_privacy ENUM('public','friends') NOT NULL DEFAULT 'public',
  equipped_title_id CHAR(36) NULL,
  streak_count INT NOT NULL DEFAULT 0,
  coins INT NOT NULL DEFAULT 0,
  check_ins_count INT NOT NULL DEFAULT 0,
  friends_count INT NOT NULL DEFAULT 0,
  pending_incoming_requests_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_profiles_username (username),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  chat_notifications TINYINT(1) NOT NULL DEFAULT 1,
  story_notifications TINYINT(1) NOT NULL DEFAULT 1,
  pulse_notifications TINYINT(1) NOT NULL DEFAULT 1,
  check_in_notifications TINYINT(1) NOT NULL DEFAULT 1,
  friend_request_notifications TINYINT(1) NOT NULL DEFAULT 1,
  plan_notifications TINYINT(1) NOT NULL DEFAULT 1,
  mention_notifications TINYINT(1) NOT NULL DEFAULT 1,
  map_share_location TINYINT(1) NOT NULL DEFAULT 1,
  show_online_status TINYINT(1) NOT NULL DEFAULT 1,
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profile_links (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(80) NOT NULL,
  url TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_profile_links_user_sort (user_id, sort_order),
  CONSTRAINT fk_profile_links_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
