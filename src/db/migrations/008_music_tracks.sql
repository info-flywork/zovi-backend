CREATE TABLE IF NOT EXISTS music_tracks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  genre VARCHAR(80) NULL,
  duration_ms INT NOT NULL,
  cover_url TEXT NULL,
  audio_url TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_music_tracks_slug (slug),
  KEY idx_music_tracks_active_sort (is_active, sort_order),
  KEY idx_music_tracks_title (title),
  KEY idx_music_tracks_artist (artist)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TEMPORARY TABLE music_track_seed (
  slug VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  genre VARCHAR(80) NOT NULL,
  duration_ms INT NOT NULL,
  cover_url TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  sort_order SMALLINT NOT NULL
);

INSERT INTO music_track_seed
  (slug, title, artist, genre, duration_ms, cover_url, audio_url, sort_order)
VALUES
('neria', 'Neria', 'Heyson', 'House', 193000,
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 1),
('outside', 'Can You Come Outside to Play?', 'Heyson', 'House', 193000,
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 2),
('midnight_walk', 'Midnight Walk', 'Heyson', 'House', 168000,
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 3),
('afterglow', 'Afterglow', 'Nova', 'Indie', 222000,
  'https://images.unsplash.com/photo-1459749411175-04741729af61?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 4),
('soft_pulse', 'Soft Pulse', 'Kite', 'Electronic', 245000,
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 5),
('neon_nights', 'Neon Nights', 'Pulse Lab', 'Synthwave', 210000,
  'https://images.unsplash.com/photo-1516280440614-6697288d5d38?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 6),
('rooftop_echo', 'Rooftop Echo', 'Clara Vale', 'Indie', 198000,
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 7),
('city_lights', 'City Lights', 'Metro Wave', 'Pop', 186000,
  'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 8),
('golden_hour', 'Golden Hour', 'Sunny Drive', 'Chill', 204000,
  'https://images.unsplash.com/photo-1460723231183-c6597db20926?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', 9),
('bassline_dream', 'Bassline Dream', 'Low Frequency', 'Bass', 231000,
  'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', 10),
('slow_burn', 'Slow Burn', 'Ember', 'R&B', 217000,
  'https://images.unsplash.com/photo-1415201179619-aeae0703ed46?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', 11),
('weekend_run', 'Weekend Run', 'Lane 8 Style', 'Dance', 189000,
  'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', 12);

INSERT INTO music_tracks (
  id, slug, title, artist, genre, duration_ms, cover_url, audio_url, sort_order, is_active
)
SELECT
  UUID(),
  s.slug,
  s.title,
  s.artist,
  s.genre,
  s.duration_ms,
  s.cover_url,
  s.audio_url,
  s.sort_order,
  1
FROM music_track_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM music_tracks mt WHERE mt.slug = s.slug
);

DROP TEMPORARY TABLE music_track_seed;
