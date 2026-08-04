INSERT INTO stamps (id, slug, cdn_url, sort_order, is_active)
SELECT
  UUID(),
  'blue_tick',
  'https://zovi.b-cdn.net/Stamps/Blue%20Tick.png',
  50,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM stamps WHERE slug = 'blue_tick'
);

INSERT INTO stamp_translations (stamp_id, locale, localized_name)
SELECT s.id, locales.locale, 'Blue Tick'
FROM stamps s
JOIN (
  SELECT 'tr' AS locale UNION ALL
  SELECT 'en' UNION ALL
  SELECT 'es' UNION ALL
  SELECT 'de' UNION ALL
  SELECT 'fr' UNION ALL
  SELECT 'it' UNION ALL
  SELECT 'pt' UNION ALL
  SELECT 'ru' UNION ALL
  SELECT 'hi' UNION ALL
  SELECT 'ko' UNION ALL
  SELECT 'ja' UNION ALL
  SELECT 'zh'
) locales
LEFT JOIN stamp_translations existing
  ON existing.stamp_id = s.id AND existing.locale = locales.locale
WHERE s.slug = 'blue_tick'
  AND existing.stamp_id IS NULL;
