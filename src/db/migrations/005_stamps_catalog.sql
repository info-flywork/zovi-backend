CREATE TABLE IF NOT EXISTS stamps (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  cdn_url TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_stamps_slug (slug),
  KEY idx_stamps_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stamp_translations (
  stamp_id CHAR(36) NOT NULL,
  locale VARCHAR(8) NOT NULL,
  localized_name VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (stamp_id, locale),
  KEY idx_stamp_translations_locale (locale),
  CONSTRAINT fk_stamp_translations_stamp
    FOREIGN KEY (stamp_id) REFERENCES stamps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TEMPORARY TABLE stamp_seed (
  slug VARCHAR(64) NOT NULL,
  name_en VARCHAR(120) NOT NULL,
  file_name VARCHAR(160) NOT NULL,
  sort_order SMALLINT NOT NULL
);

INSERT INTO stamp_seed (slug, name_en, file_name, sort_order) VALUES
('after_hours', 'After Hours', 'After Hours.png', 1),
('airport_mode', 'Airport Mode', 'Airport Mode.png', 2),
('bass_drop', 'Bass Drop', 'Bass Drop.png', 3),
('beach_bum', 'Beach Bum', 'Beach Bum.png', 4),
('brew_master', 'Brew Master', 'Brew Master.png', 5),
('brunch_club', 'Brunch Club', 'Brunch Club.png', 6),
('city_hopper', 'City Hopper', 'City Hopper.png', 7),
('club_king_queen', 'Club King:Queen', 'Club King:Queen.png', 8),
('cold_brew', 'Cold Brew', 'Cold Brew.png', 9),
('connector', 'Connector', 'Connector.png', 10),
('dj_booth', 'DJ Booth', 'DJ Booth.png', 11),
('duo', 'Duo', 'Duo.png', 12),
('eclipse', 'Eclipse', 'Eclipse.png', 13),
('festival', 'Festival', 'Festival.png', 14),
('first_friend', 'First Friend', 'First Friend.png', 15),
('foodie', 'Foodie', 'Foodie.png', 16),
('founder', 'Founder', 'Founder.png', 17),
('ghost', 'Ghost', 'Ghost.png', 18),
('halloween', 'Halloween', 'Halloween.png', 19),
('hidden_gem', 'Hidden Gem', 'Hidden Gem.png', 20),
('hype_man', 'Hype Man', 'Hype Man.png', 21),
('influencer', 'Influencer', 'Influencer.png', 22),
('last_call', 'Last Call', 'Last Call.png', 23),
('local_legend', 'Local Legend', 'Local Legend.png', 24),
('midnight_rider', 'Midnight Rider', 'Midnight Rider.png', 25),
('museum_rat', 'Museum Rat', 'Museum Rat.png', 26),
('neon_ghost', 'Neon Ghost', 'Neon Ghost.png', 27),
('new_year', 'New Year', 'New Year.png', 28),
('og', 'OG', 'OG.png', 29),
('park_life', 'Park Life', 'Park Life.png', 30),
('party_starter', 'Party Starter', 'Party Starter.png', 31),
('pizza_night', 'Pizza Night', 'Pizza Night.png', 32),
('rainy_day', 'Rainy Day', 'Rainy Day.png', 33),
('ramen_lord', 'Ramen Lord', 'Ramen Lord.png', 34),
('rooftop_diner', 'Rooftop Diner', 'Rooftop Diner.png', 35),
('rooftop_king', 'Rooftop King', 'Rooftop King.png', 36),
('snow_day', 'Snow Day', 'Snow Day.png', 37),
('squad_goals', 'Squad Goals', 'Squad Goals.png', 38),
('street_food', 'Street Food', 'Street Food.png', 39),
('strobe_light', 'Strobe Light', 'Strobe Light.png', 40),
('summer_solstice', 'Summer Solstice', 'Summer Solstice.png', 41),
('sunset_chaser', 'Sunset Chaser', 'Sunset Chaser.png', 42),
('sweet_tooth', 'Sweet Tooth', 'Sweet Tooth.png', 43),
('tea_ceremony', 'Tea Ceremony', 'Tea Ceremony.png', 44),
('valentine', 'Valentine', 'Valentine.png', 45),
('vip_pass', 'VIP Pass', 'VIP Pass.png', 46),
('wanderer', 'Wanderer', 'Wanderer.png', 47),
('wingman', 'Wingman', 'Wingman.png', 48),
('zovi_day', 'Zovi Day', 'Zovi Day.png', 49);

INSERT INTO stamps (id, slug, cdn_url, sort_order, is_active)
SELECT
  UUID(),
  s.slug,
  CONCAT(
    'https://zovi.b-cdn.net/Stamps/',
    REPLACE(REPLACE(s.file_name, ' ', '%20'), ':', '%3A')
  ),
  s.sort_order,
  1
FROM stamp_seed s
LEFT JOIN stamps existing ON existing.slug = s.slug
WHERE existing.id IS NULL;

CREATE TEMPORARY TABLE locale_seed (locale VARCHAR(8) NOT NULL);
INSERT INTO locale_seed (locale) VALUES
('tr'), ('en'), ('es'), ('de'), ('fr'), ('it'),
('pt'), ('ru'), ('hi'), ('ko'), ('ja'), ('zh');

INSERT INTO stamp_translations (stamp_id, locale, localized_name)
SELECT st.id, l.locale, s.name_en
FROM stamp_seed s
JOIN stamps st ON st.slug = s.slug
JOIN locale_seed l
LEFT JOIN stamp_translations t
  ON t.stamp_id = st.id AND t.locale = l.locale
WHERE t.stamp_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS locale_seed;
DROP TEMPORARY TABLE IF EXISTS stamp_seed;
