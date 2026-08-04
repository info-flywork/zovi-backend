CREATE TABLE IF NOT EXISTS user_stickers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NULL,
  image_url VARCHAR(1024) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'generated',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_stickers_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_stickers_user_created (user_id, created_at DESC)
);
