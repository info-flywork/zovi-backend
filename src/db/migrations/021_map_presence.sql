-- Live map presence for friends / nearby anon filters.
CREATE TABLE IF NOT EXISTS map_presence (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  accuracy_m DOUBLE NULL,
  location_label VARCHAR(120) NULL,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_map_presence_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_map_presence_expires (expires_at),
  KEY idx_map_presence_anon_expires (is_anonymous, expires_at),
  KEY idx_map_presence_lat_lng (lat, lng)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
