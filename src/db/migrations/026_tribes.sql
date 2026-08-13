-- Algorithmic tribes: auto-forming lifestyle communities unlocked by streaks.
--
-- A tribe is the triplet (category x area x cadence). Membership has two states:
--   * eligible  -> user is progressing toward the streak threshold ("8/10")
--   * member    -> user opted in ("Gruba Katıl") and is in the group chat
-- Featured tribes (is_featured = 1) are algorithmic invitations anyone may join
-- regardless of progress -- the "Algoritma seni bu gruba ekledi" card.

CREATE TABLE IF NOT EXISTS tribes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  category VARCHAR(32) NOT NULL DEFAULT 'other',
  area_key VARCHAR(64) NOT NULL DEFAULT 'all',
  area_label VARCHAR(120) NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(240) NULL,
  emoji VARCHAR(16) NULL,
  cadence_label VARCHAR(120) NULL,
  threshold INT NOT NULL DEFAULT 10,
  min_members INT NOT NULL DEFAULT 6,
  member_count_cache INT NOT NULL DEFAULT 0,
  status ENUM('forming','active','dormant') NOT NULL DEFAULT 'active',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  conversation_id CHAR(36) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tribes_area_category (area_key, category),
  KEY idx_tribes_status (status, is_featured, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tribe_members (
  tribe_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  state ENUM('eligible','member') NOT NULL DEFAULT 'eligible',
  progress INT NOT NULL DEFAULT 0,
  joined_at DATETIME(3) NULL,
  unlocked_at DATETIME(3) NULL,
  last_progress_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (tribe_id, user_id),
  CONSTRAINT fk_tribe_members_tribe FOREIGN KEY (tribe_id) REFERENCES tribes(id) ON DELETE CASCADE,
  CONSTRAINT fk_tribe_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tribe_members_user (user_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed a starter set so the screen renders real data before the Phase 1
-- formation cron exists. Featured rows are open algorithmic invitations;
-- the rest gate on the signed-in user's check-in streak in that category.
INSERT INTO tribes
  (id, category, area_key, area_label, name, description, emoji, cadence_label,
   threshold, min_members, member_count_cache, status, is_featured, sort_order)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'other', 'beyoglu', 'Beyoğlu',
   'Beyoğlu Gece Kuşları',
   'Algoritma seni bu gruba ekledi. 10+ streak ile aynı yaşam tarzını paylaşan 8 kişiyle tanış.',
   '🌙', 'Hepsi yakınında', 10, 6, 8, 'active', 1, 10),
  ('b1000000-0000-4000-8000-000000000002', 'cafe', 'kadikoy', 'Kadıköy',
   'Kadıköy Kahve Ritüeli', 'Her sabah aynı kahveci rotasında buluşan topluluk.',
   '☕', 'Her sabah aktif', 10, 6, 12, 'active', 0, 20),
  ('b1000000-0000-4000-8000-000000000003', 'gym', 'bogaz', 'Boğaz',
   'Boğaz Sporcuları', 'Sabah rutinini Boğaz kıyısında tamamlayanlar.',
   '🏃', 'Sabah rutini', 10, 6, 7, 'active', 0, 30),
  ('b1000000-0000-4000-8000-000000000004', 'restaurant', 'taksim', 'Taksim',
   'Taksim Gece Hayatı', 'Gece programını Taksim çevresinde kuran ekip.',
   '🍻', 'Gece aktif', 10, 6, 15, 'active', 0, 40),
  ('b1000000-0000-4000-8000-000000000005', 'culture', 'sultanahmet', 'Sultanahmet',
   'Müze gezginleri', 'Kültür rotalarını birlikte keşfedenler.',
   '🏛️', 'Hafta sonu aktif', 10, 6, 9, 'active', 0, 50)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  emoji = VALUES(emoji),
  cadence_label = VALUES(cadence_label),
  is_featured = VALUES(is_featured),
  sort_order = VALUES(sort_order);
