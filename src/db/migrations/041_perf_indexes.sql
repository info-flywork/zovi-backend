-- Perf: cover hot lookups that were falling back to full conversation/notif scans.
-- messages: promoteSenderInboxIfNeeded / promoteAllSenderInboxes filter by
-- (conversation_id, sender_id) on every message list + conversation list call.
ALTER TABLE messages
  ADD KEY idx_messages_conv_sender (conversation_id, sender_id);

-- notifications: findRecentForObject / updateActionForObject filter by
-- (recipient_id, object_type, object_id, type) on every notify call.
ALTER TABLE notifications
  ADD KEY idx_notifications_object (recipient_id, object_type, object_id, type);
