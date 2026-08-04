-- Senders who already messaged should never sit in the request folder.
UPDATE conversation_members m
INNER JOIN messages msg
  ON msg.conversation_id = m.conversation_id
 AND msg.sender_id = m.user_id
 AND msg.deleted_at IS NULL
SET m.folder = 'inbox'
WHERE m.folder = 'request'
  AND m.deleted_at IS NULL;
