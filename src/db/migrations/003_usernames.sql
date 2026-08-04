CREATE TABLE IF NOT EXISTS usernames (
  username VARCHAR(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (username),
  UNIQUE KEY uq_usernames_user_id (user_id),
  CONSTRAINT fk_usernames_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO usernames (username, user_id)
SELECT LOWER(TRIM(username)), user_id
FROM user_profiles
WHERE username IS NOT NULL
  AND TRIM(username) <> '';
