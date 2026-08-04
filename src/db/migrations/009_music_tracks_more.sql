CREATE TEMPORARY TABLE music_track_seed_more (
  slug VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  genre VARCHAR(80) NOT NULL,
  duration_ms INT NOT NULL,
  cover_url TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  sort_order SMALLINT NOT NULL
);

INSERT INTO music_track_seed_more
  (slug, title, artist, genre, duration_ms, cover_url, audio_url, sort_order)
VALUES
('late_train', 'Late Train', 'Harbor Line', 'Indie', 201000,
  'https://images.unsplash.com/photo-1514320291840-309542e577ed?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3', 13),
('orange_sky', 'Orange Sky', 'Saffron', 'Chill', 214000,
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3', 14),
('glass_floor', 'Glass Floor', 'Mirror Unit', 'Electronic', 228000,
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3', 15),
('quiet_club', 'Quiet Club', 'Velvet Room', 'House', 196000,
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3', 16),
('paper_plane', 'Paper Plane', 'Folded Notes', 'Pop', 183000,
  'https://images.unsplash.com/photo-1459749411175-04741729af61?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 17),
('northbound', 'Northbound', 'Atlas Coast', 'Synthwave', 239000,
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 18),
('soft_static', 'Soft Static', 'Signal Bloom', 'Ambient', 252000,
  'https://images.unsplash.com/photo-1516280440614-6697288d5d38?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 19),
('yellow_cab', 'Yellow Cab', 'Night Shift', 'Jazz', 207000,
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 20),
('blue_ticket', 'Blue Ticket', 'Gate 9', 'Indie', 191000,
  'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 21),
('echo_lane', 'Echo Lane', 'Sidewalk', 'Hip-Hop', 176000,
  'https://images.unsplash.com/photo-1460723231183-c6597db20926?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 22),
('silver_rain', 'Silver Rain', 'Window Seat', 'R&B', 223000,
  'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 23),
('open_road', 'Open Road', 'Mile Marker', 'Dance', 199000,
  'https://images.unsplash.com/photo-1415201179619-aeae0703ed46?w=200&h=200&fit=crop',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 24);

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
FROM music_track_seed_more s
WHERE NOT EXISTS (
  SELECT 1 FROM music_tracks mt WHERE mt.slug = s.slug
);

DROP TEMPORARY TABLE music_track_seed_more;
