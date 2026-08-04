-- One-way content demotion: restrictor still sees restricted user's content,
-- but feeds (e.g. stories) push them to the end.

CREATE TABLE IF NOT EXISTS restrictions (
  restrictor_id CHAR(36) NOT NULL,
  restricted_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (restrictor_id, restricted_id),
  KEY idx_restrictions_restricted (restricted_id),
  CONSTRAINT fk_restrictions_restrictor
    FOREIGN KEY (restrictor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_restrictions_restricted
    FOREIGN KEY (restricted_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_restrictions_not_self CHECK (restrictor_id <> restricted_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
