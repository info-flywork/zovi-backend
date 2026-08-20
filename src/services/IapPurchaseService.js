'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');

/** App Store / Play product ids → Zovi coin amounts. */
const PRODUCT_TOKEN_AMOUNTS = Object.freeze({
  zovi_pro_100_tokens: 100,
  zovi_pro_200_tokens: 200,
  zovi_pro_500_tokens: 500,
  // Package identifiers (fallback if store id is missing).
  zovi_100_tokens: 100,
  zovi_200_tokens: 200,
  zovi_500_tokens: 500,
});

const CREDIT_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);

class IapPurchaseService {
  tokensForProduct(productId) {
    const key = String(productId || '').trim();
    return PRODUCT_TOKEN_AMOUNTS[key] || 0;
  }

  /**
   * Credit coins once per store transaction (client confirm or webhook).
   * @returns {Promise<{ credited: boolean, coinsBalance: number, tokensGranted: number, duplicate?: boolean }>}
   */
  async creditPurchase({
    userId,
    productId,
    storeTransactionId,
    revenuecatEventId = null,
    store = null,
    source = 'client',
  }) {
    const tokens = this.tokensForProduct(productId);
    if (!userId || !storeTransactionId || tokens <= 0) {
      const err = new Error('Invalid IAP purchase payload');
      err.status = 400;
      err.code = 'INVALID_IAP_PURCHASE';
      throw err;
    }

    return withTransaction(async (conn) => {
      const [existing] = await conn.execute(
        `SELECT id, balance_after, tokens_granted
         FROM iap_purchases
         WHERE store_transaction_id = ?
            OR (revenuecat_event_id IS NOT NULL AND revenuecat_event_id = ?)
         LIMIT 1`,
        [storeTransactionId, revenuecatEventId || storeTransactionId],
      );
      if (existing[0]) {
        const [profiles] = await conn.execute(
          `SELECT coins FROM user_profiles WHERE user_id = ? LIMIT 1`,
          [userId],
        );
        return {
          credited: false,
          duplicate: true,
          coinsBalance: Number(profiles[0]?.coins || existing[0].balance_after || 0),
          tokensGranted: Number(existing[0].tokens_granted || 0),
        };
      }

      const [profiles] = await conn.execute(
        `SELECT coins FROM user_profiles
         WHERE user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [userId],
      );
      if (!profiles[0]) {
        const err = new Error('User profile not found');
        err.status = 404;
        err.code = 'USER_NOT_FOUND';
        throw err;
      }

      const nextBalance = Number(profiles[0].coins || 0) + tokens;
      const purchaseId = randomUUID();
      const coinTxId = randomUUID();

      await conn.execute(
        `INSERT INTO coin_transactions
           (id, user_id, delta, reason, source_type, source_id, balance_after)
         VALUES (?, ?, ?, 'iap_purchase', 'iap', ?, ?)`,
        [coinTxId, userId, tokens, purchaseId, nextBalance],
      );
      await conn.execute(
        `UPDATE user_profiles SET coins = ? WHERE user_id = ?`,
        [nextBalance, userId],
      );
      await conn.execute(
        `INSERT INTO iap_purchases (
           id, user_id, product_id, store_transaction_id, revenuecat_event_id,
           tokens_granted, store, source, balance_after
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          userId,
          String(productId).slice(0, 120),
          String(storeTransactionId).slice(0, 191),
          revenuecatEventId ? String(revenuecatEventId).slice(0, 191) : null,
          tokens,
          store ? String(store).slice(0, 32) : null,
          String(source).slice(0, 32),
          nextBalance,
        ],
      );

      logger.info('iap_purchase_credited', {
        userId,
        productId,
        tokens,
        storeTransactionId,
        source,
        coinsBalance: nextBalance,
      });

      return {
        credited: true,
        duplicate: false,
        coinsBalance: nextBalance,
        tokensGranted: tokens,
      };
    });
  }

  async handleRevenueCatWebhook(event) {
    const type = String(event?.type || '').toUpperCase();
    if (!CREDIT_EVENT_TYPES.has(type)) {
      return { ignored: true, reason: 'event_type', type };
    }

    const userId = String(event.app_user_id || '').trim();
    const productId = String(event.product_id || event.entitlement_id || '').trim();
    const storeTransactionId = String(
      event.transaction_id ||
        event.original_transaction_id ||
        event.id ||
        '',
    ).trim();
    const revenuecatEventId = event.id ? String(event.id) : null;
    const store = event.store ? String(event.store).toLowerCase() : null;

    if (!userId || userId.startsWith('$RCAnonymousID')) {
      return { ignored: true, reason: 'anonymous_or_missing_user' };
    }

    // Only credit known MySQL users (app_user_id = users.id).
    const users = await query(
      `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    if (!users[0]) {
      return { ignored: true, reason: 'unknown_user', userId };
    }

    if (!this.tokensForProduct(productId)) {
      return { ignored: true, reason: 'unknown_product', productId };
    }

    const result = await this.creditPurchase({
      userId,
      productId,
      storeTransactionId,
      revenuecatEventId,
      store,
      source: 'webhook',
    });
    return { ignored: false, ...result };
  }
}

module.exports = {
  IapPurchaseService,
  PRODUCT_TOKEN_AMOUNTS,
};
