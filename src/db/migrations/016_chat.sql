-- Direct messages (1:1) with per-member inbox/request folders

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  last_message_at DATETIME(3) NULL,
  last_message_preview VARCHAR(280) NULL,
  last_message_sender_id CHAR(36) NULL,
  KEY idx_conversations_last_message (last_message_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  -- inbox = Mesajlar, request = İstek
  folder ENUM('inbox', 'request') NOT NULL DEFAULT 'request',
  unread_count INT NOT NULL DEFAULT 0,
  last_read_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_member_user_folder (user_id, folder, deleted_at),
  CONSTRAINT fk_conv_members_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_members_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canonical 1:1 pair (user_a < user_b lexicographically)
CREATE TABLE IF NOT EXISTS dm_pairs (
  user_a CHAR(36) NOT NULL,
  user_b CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_a, user_b),
  UNIQUE KEY uq_dm_pairs_conversation (conversation_id),
  CONSTRAINT fk_dm_pairs_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_dm_pairs_user_a
    FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dm_pairs_user_b
    FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_dm_pairs_order CHECK (user_a < user_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  type ENUM('text', 'image', 'voice', 'stamp') NOT NULL DEFAULT 'text',
  body TEXT NULL,
  media_url TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_messages_conversation (conversation_id, created_at DESC),
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
