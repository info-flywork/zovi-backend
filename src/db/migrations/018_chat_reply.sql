-- Optional reply / quote metadata on messages
ALTER TABLE messages
  ADD COLUMN reply_to_message_id CHAR(36) NULL AFTER media_url,
  ADD COLUMN reply_preview VARCHAR(280) NULL AFTER reply_to_message_id;
