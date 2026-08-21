-- checked_at was written with MySQL SYSTEM local time (+03) while the Node
-- pool reads DATETIME as UTC (timezone Z). That made clients show +3h.
-- Store UTC going forward, and shift existing rows back by the server offset.

ALTER TABLE check_ins
  MODIFY COLUMN checked_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3));

UPDATE check_ins
SET checked_at = DATE_SUB(checked_at, INTERVAL 3 HOUR)
WHERE checked_at IS NOT NULL;
