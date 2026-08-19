UPDATE tribes t
SET owner_user_id = (
  SELECT tm.user_id
  FROM tribe_members tm
  WHERE tm.tribe_id = t.id
    AND tm.state = 'member'
  ORDER BY tm.joined_at ASC, tm.created_at ASC
  LIMIT 1
)
WHERE t.area_key LIKE 'custom-%'
  AND (t.owner_user_id IS NULL OR TRIM(t.owner_user_id) = '');
