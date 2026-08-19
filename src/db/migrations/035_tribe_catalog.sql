-- Fixed 48 default tribes. Same catalogue for every user.
ALTER TABLE tribes ADD COLUMN name_key VARCHAR(80) NULL AFTER name;

UPDATE tribes SET status = 'dormant' WHERE status <> 'dormant' AND area_key NOT LIKE 'custom-%' AND area_key NOT LIKE 'catalog-%';

INSERT INTO tribes
  (id, category, area_key, area_label, name, name_key, description, emoji, cadence_label,
   threshold, min_members, member_count_cache, status, is_featured, sort_order)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'other', 'catalog-museum_explorers', NULL, 'Müze gezginleri', 'tribe_name_museum_explorers', '', '🏛️', '', 3, 1, 0, 'active', 0, 1),
  ('a1000000-0000-4000-8000-000000000002', 'other', 'catalog-coffee_ritual', NULL, 'Kahve ritüeli', 'tribe_name_coffee_ritual', '', '☕', '', 3, 1, 0, 'active', 0, 2),
  ('a1000000-0000-4000-8000-000000000003', 'other', 'catalog-street_flavors', NULL, 'Sokak lezzetleri', 'tribe_name_street_flavors', '', '🌮', '', 3, 1, 0, 'active', 0, 3),
  ('a1000000-0000-4000-8000-000000000004', 'other', 'catalog-park_explorers', NULL, 'Park kaşifleri', 'tribe_name_park_explorers', '', '🌳', '', 3, 1, 0, 'active', 0, 4),
  ('a1000000-0000-4000-8000-000000000005', 'other', 'catalog-book_corner', NULL, 'Kitap köşesi', 'tribe_name_book_corner', '', '📚', '', 3, 1, 0, 'active', 0, 5),
  ('a1000000-0000-4000-8000-000000000006', 'other', 'catalog-sunset_hunters', NULL, 'Gün batımı avcıları', 'tribe_name_sunset_hunters', '', '🌅', '', 5, 1, 0, 'active', 0, 6),
  ('a1000000-0000-4000-8000-000000000007', 'other', 'catalog-morning_walkers', NULL, 'Sabah yürüyüşçüleri', 'tribe_name_morning_walkers', '', '🚶', '', 5, 1, 0, 'active', 0, 7),
  ('a1000000-0000-4000-8000-000000000008', 'other', 'catalog-spot_hunters', NULL, 'Plaka avcıları', 'tribe_name_spot_hunters', '', '📸', '', 5, 1, 0, 'active', 0, 8),
  ('a1000000-0000-4000-8000-000000000009', 'other', 'catalog-cinema_night', NULL, 'Sinema gecesi', 'tribe_name_cinema_night', '', '🎬', '', 5, 1, 0, 'active', 0, 9),
  ('a1000000-0000-4000-8000-000000000010', 'other', 'catalog-concert_queue', NULL, 'Konser kuyruğu', 'tribe_name_concert_queue', '', '🎵', '', 5, 1, 0, 'active', 0, 10),
  ('a1000000-0000-4000-8000-000000000011', 'other', 'catalog-seaside_wanderers', NULL, 'Sahil gezginleri', 'tribe_name_seaside_wanderers', '', '🌊', '', 7, 1, 0, 'active', 0, 11),
  ('a1000000-0000-4000-8000-000000000012', 'other', 'catalog-bazaar_collectors', NULL, 'Çarşı toplayıcıları', 'tribe_name_bazaar_collectors', '', '🛍️', '', 7, 1, 0, 'active', 0, 12),
  ('a1000000-0000-4000-8000-000000000013', 'other', 'catalog-gallery_tour', NULL, 'Galeri turu', 'tribe_name_gallery_tour', '', '🖼️', '', 7, 1, 0, 'active', 0, 13),
  ('a1000000-0000-4000-8000-000000000014', 'other', 'catalog-vintage_hunters', NULL, 'Vintage avcıları', 'tribe_name_vintage_hunters', '', '👗', '', 7, 1, 0, 'active', 0, 14),
  ('a1000000-0000-4000-8000-000000000015', 'other', 'catalog-dog_walks', NULL, 'Köpekli geziler', 'tribe_name_dog_walks', '', '🐕', '', 7, 1, 0, 'active', 0, 15),
  ('a1000000-0000-4000-8000-000000000016', 'other', 'catalog-night_owls', NULL, 'Gece kuşları', 'tribe_name_night_owls', '', '🌙', '', 10, 1, 0, 'active', 0, 16),
  ('a1000000-0000-4000-8000-000000000017', 'other', 'catalog-gym_crew', NULL, 'Spor salonları', 'tribe_name_gym_crew', '', '🏋️', '', 10, 1, 0, 'active', 0, 17),
  ('a1000000-0000-4000-8000-000000000018', 'other', 'catalog-bike_route', NULL, 'Bisiklet rotası', 'tribe_name_bike_route', '', '🚴', '', 10, 1, 0, 'active', 0, 18),
  ('a1000000-0000-4000-8000-000000000019', 'other', 'catalog-yoga_hall', NULL, 'Yoga holü', 'tribe_name_yoga_hall', '', '🧘', '', 10, 1, 0, 'active', 0, 19),
  ('a1000000-0000-4000-8000-000000000020', 'other', 'catalog-photo_stops', NULL, 'Fotoğraf durakları', 'tribe_name_photo_stops', '', '📷', '', 10, 1, 0, 'active', 0, 20),
  ('a1000000-0000-4000-8000-000000000021', 'other', 'catalog-brunch_club', NULL, 'Brunch kulübü', 'tribe_name_brunch_club', '', '🥞', '', 12, 1, 0, 'active', 0, 21),
  ('a1000000-0000-4000-8000-000000000022', 'other', 'catalog-dessert_break', NULL, 'Tatlı molası', 'tribe_name_dessert_break', '', '🍰', '', 12, 1, 0, 'active', 0, 22),
  ('a1000000-0000-4000-8000-000000000023', 'other', 'catalog-live_music', NULL, 'Canlı müzik', 'tribe_name_live_music', '', '🎤', '', 12, 1, 0, 'active', 0, 23),
  ('a1000000-0000-4000-8000-000000000024', 'other', 'catalog-dance_floor', NULL, 'Dans tabanı', 'tribe_name_dance_floor', '', '💃', '', 12, 1, 0, 'active', 0, 24),
  ('a1000000-0000-4000-8000-000000000025', 'other', 'catalog-nature_route', NULL, 'Doğa rotası', 'tribe_name_nature_route', '', '🌲', '', 15, 1, 0, 'active', 0, 25),
  ('a1000000-0000-4000-8000-000000000026', 'other', 'catalog-campfire', NULL, 'Kamp ateşi', 'tribe_name_campfire', '', '🔥', '', 15, 1, 0, 'active', 0, 26),
  ('a1000000-0000-4000-8000-000000000027', 'other', 'catalog-mountain_view', NULL, 'Dağ manzarası', 'tribe_name_mountain_view', '', '⛰️', '', 15, 1, 0, 'active', 0, 27),
  ('a1000000-0000-4000-8000-000000000028', 'other', 'catalog-lakeside', NULL, 'Göl kenarı', 'tribe_name_lakeside', '', '🏞️', '', 15, 1, 0, 'active', 0, 28),
  ('a1000000-0000-4000-8000-000000000029', 'other', 'catalog-late_night_bites', NULL, 'Gece lezzetleri', 'tribe_name_late_night_bites', '', '🍜', '', 18, 1, 0, 'active', 0, 29),
  ('a1000000-0000-4000-8000-000000000030', 'other', 'catalog-chef_table', NULL, 'Şef masası', 'tribe_name_chef_table', '', '🍽️', '', 18, 1, 0, 'active', 0, 30),
  ('a1000000-0000-4000-8000-000000000031', 'other', 'catalog-vegan_discovery', NULL, 'Vegan keşif', 'tribe_name_vegan_discovery', '', '🥗', '', 18, 1, 0, 'active', 0, 31),
  ('a1000000-0000-4000-8000-000000000032', 'other', 'catalog-cocktail_hour', NULL, 'Kokteyl saati', 'tribe_name_cocktail_hour', '', '🍸', '', 21, 1, 0, 'active', 0, 32),
  ('a1000000-0000-4000-8000-000000000033', 'other', 'catalog-rooftop_nights', NULL, 'Rooftop geceleri', 'tribe_name_rooftop_nights', '', '🌃', '', 21, 1, 0, 'active', 0, 33),
  ('a1000000-0000-4000-8000-000000000034', 'other', 'catalog-after_hours', NULL, 'After hours', 'tribe_name_after_hours', '', '🪩', '', 21, 1, 0, 'active', 0, 34),
  ('a1000000-0000-4000-8000-000000000035', 'other', 'catalog-match_day', NULL, 'Maç günü', 'tribe_name_match_day', '', '⚽', '', 21, 1, 0, 'active', 0, 35),
  ('a1000000-0000-4000-8000-000000000036', 'other', 'catalog-running_club', NULL, 'Koşu kulübü', 'tribe_name_running_club', '', '🏃', '', 25, 1, 0, 'active', 0, 36),
  ('a1000000-0000-4000-8000-000000000037', 'other', 'catalog-swim_hour', NULL, 'Yüzme saati', 'tribe_name_swim_hour', '', '🏊', '', 25, 1, 0, 'active', 0, 37),
  ('a1000000-0000-4000-8000-000000000038', 'other', 'catalog-climbing_wall', NULL, 'Tırmanış duvarı', 'tribe_name_climbing_wall', '', '🧗', '', 25, 1, 0, 'active', 0, 38),
  ('a1000000-0000-4000-8000-000000000039', 'other', 'catalog-skate_park', NULL, 'Skate park', 'tribe_name_skate_park', '', '🛹', '', 30, 1, 0, 'active', 0, 39),
  ('a1000000-0000-4000-8000-000000000040', 'other', 'catalog-arcade_night', NULL, 'Arcade gecesi', 'tribe_name_arcade_night', '', '🕹️', '', 30, 1, 0, 'active', 0, 40),
  ('a1000000-0000-4000-8000-000000000041', 'other', 'catalog-board_game_table', NULL, 'Board game masası', 'tribe_name_board_game_table', '', '🎲', '', 30, 1, 0, 'active', 0, 41),
  ('a1000000-0000-4000-8000-000000000042', 'other', 'catalog-vinyl_shelves', NULL, 'Vinyl rafları', 'tribe_name_vinyl_shelves', '', '💿', '', 35, 1, 0, 'active', 0, 42),
  ('a1000000-0000-4000-8000-000000000043', 'other', 'catalog-indie_stage', NULL, 'Indie sahne', 'tribe_name_indie_stage', '', '🎸', '', 35, 1, 0, 'active', 0, 43),
  ('a1000000-0000-4000-8000-000000000044', 'other', 'catalog-podcast_corner', NULL, 'Podcast köşesi', 'tribe_name_podcast_corner', '', '🎧', '', 35, 1, 0, 'active', 0, 44),
  ('a1000000-0000-4000-8000-000000000045', 'other', 'catalog-startup_coffee', NULL, 'Startup kahvesi', 'tribe_name_startup_coffee', '', '💻', '', 40, 1, 0, 'active', 0, 45),
  ('a1000000-0000-4000-8000-000000000046', 'other', 'catalog-coworking_break', NULL, 'Coworking molası', 'tribe_name_coworking_break', '', '☕', '', 40, 1, 0, 'active', 0, 46),
  ('a1000000-0000-4000-8000-000000000047', 'other', 'catalog-night_photographers', NULL, 'Gece fotoğrafçıları', 'tribe_name_night_photographers', '', '📸', '', 45, 1, 0, 'active', 0, 47),
  ('a1000000-0000-4000-8000-000000000048', 'other', 'catalog-city_explorers', NULL, 'Şehir kaşifleri', 'tribe_name_city_explorers', '', '🗺️', '', 50, 1, 0, 'active', 0, 48)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  name_key = VALUES(name_key),
  emoji = VALUES(emoji),
  threshold = VALUES(threshold),
  status = 'active',
  is_featured = 0,
  sort_order = VALUES(sort_order);

-- Seed @lucielle as member of the first 24 catalog tribes.
INSERT INTO tribe_members
  (tribe_id, user_id, state, progress, joined_at, unlocked_at, last_progress_at)
SELECT t.id, u.id, 'member', t.threshold, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM tribes t
INNER JOIN (
  SELECT id FROM users WHERE id = '73caf112-d624-4340-80c1-d07ddc319dd4'
  UNION
  SELECT user_id FROM user_profiles WHERE LOWER(username) = 'lucielle'
) u
WHERE t.area_key LIKE 'catalog-%' AND t.sort_order <= 24
ON DUPLICATE KEY UPDATE
  state = 'member',
  progress = VALUES(progress),
  joined_at = COALESCE(tribe_members.joined_at, VALUES(joined_at)),
  unlocked_at = COALESCE(tribe_members.unlocked_at, VALUES(unlocked_at));

UPDATE tribes t
SET member_count_cache = (
  SELECT COUNT(*) FROM tribe_members m
  WHERE m.tribe_id = t.id AND m.state = 'member'
)
WHERE t.area_key LIKE 'catalog-%';

