-- Persist check-in photo URLs for map restore after app restart.
ALTER TABLE check_ins
  ADD COLUMN photo_urls_json TEXT NULL AFTER photo_privacy;
