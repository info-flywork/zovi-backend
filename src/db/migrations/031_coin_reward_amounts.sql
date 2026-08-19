-- Recalibrate check-in coin reward amounts.
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
