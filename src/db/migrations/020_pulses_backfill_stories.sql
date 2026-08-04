-- Backfill profile pulses from every existing story (skip already mirrored).
INSERT INTO pulses (
  id,
  user_id,
  media_url,
  storage_key,
  media_type,
  source_type,
  source_id,
  audience,
  place_name,
  lat,
  lng,
  caption,
  like_count,
  view_count,
  created_at,
  expires_at,
  deleted_at
)
SELECT
  UUID(),
  s.user_id,
  s.media_url,
  s.storage_key,
  s.media_type,
  'story',
  s.id,
  s.audience,
  NULL,
  NULL,
  NULL,
  NULL,
  0,
  COALESCE(s.view_count, 0),
  s.created_at,
  DATE_ADD(s.created_at, INTERVAL 365 DAY),
  NULL
FROM stories s
LEFT JOIN pulses p
  ON p.source_type = 'story'
 AND p.source_id = s.id
WHERE p.id IS NULL
  AND s.deleted_at IS NULL
  AND s.media_url IS NOT NULL
  AND TRIM(s.media_url) <> '';
