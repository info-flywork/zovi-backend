-- District tagging for venues so tribes can form per (district, category).
-- Backfilled from lat/lng by the tribe formation job (utils/istanbulDistricts).

ALTER TABLE venues
  ADD COLUMN district VARCHAR(64) NULL AFTER category;

ALTER TABLE venues
  ADD KEY idx_venues_district_category (district, category);
