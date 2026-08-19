ALTER TABLE tribes
  ADD COLUMN owner_user_id CHAR(36) NULL AFTER conversation_id,
  ADD COLUMN photo_url VARCHAR(500) NULL AFTER owner_user_id;

ALTER TABLE tribes
  ADD KEY idx_tribes_owner_user (owner_user_id);
