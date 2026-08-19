-- Leave @lucielle from the lowest-threshold catalog tribes so they appear
-- as joinable featured invitations (carousel).
DELETE tm
FROM tribe_members tm
INNER JOIN tribes t ON t.id = tm.tribe_id
INNER JOIN (
  SELECT id FROM users WHERE id = '73caf112-d624-4340-80c1-d07ddc319dd4'
  UNION
  SELECT user_id FROM user_profiles WHERE LOWER(username) = 'lucielle'
) u ON u.id = tm.user_id
WHERE t.area_key LIKE 'catalog-%' AND t.sort_order BETWEEN 1 AND 5;

UPDATE tribes t
SET member_count_cache = (
  SELECT COUNT(*) FROM tribe_members m
  WHERE m.tribe_id = t.id AND m.state = 'member'
)
WHERE t.area_key LIKE 'catalog-%' AND t.sort_order BETWEEN 1 AND 5;
