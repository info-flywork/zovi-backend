-- Idempotent ledger for RevenueCat / App Store / Play consumable token packs.
CREATE TABLE IF NOT EXISTS iap_purchases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  product_id VARCHAR(120) NOT NULL,
  store_transaction_id VARCHAR(191) NOT NULL,
  revenuecat_event_id VARCHAR(191) NULL,
  tokens_granted INT NOT NULL,
  store VARCHAR(32) NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'client',
  balance_after INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_iap_purchases_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_iap_store_tx (store_transaction_id),
  UNIQUE KEY uq_iap_rc_event (revenuecat_event_id),
  KEY idx_iap_user_time (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
