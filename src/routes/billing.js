'use strict';

const express = require('express');
const { env } = require('../config/env');
const { requireFirebaseAuth } = require('../middleware/auth');
const { IapPurchaseService } = require('../services/IapPurchaseService');
const { logger } = require('../utils/logger');

const router = express.Router();
const iap = new IapPurchaseService();

function webhookAuthorized(req) {
  const expected = (env.revenueCat.webhookAuth || '').trim();
  if (!expected) {
    // Misconfigured: reject rather than open the door.
    return false;
  }
  const header = req.headers.authorization || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  if (bearer && bearer[1].trim() === expected) return true;
  // RevenueCat also supports a raw Authorization value matching the secret.
  if (header.trim() === expected) return true;
  return false;
}

/**
 * Client-side confirm after paywall purchase — credits coins immediately.
 * Body: { productId, transactionId, store? }
 */
router.post('/purchases/confirm', requireFirebaseAuth, async (req, res, next) => {
  try {
    const productId = String(req.body?.productId || '').trim();
    const transactionId = String(req.body?.transactionId || '').trim();
    const store = req.body?.store ? String(req.body.store).trim() : null;

    const result = await iap.creditPurchase({
      userId: req.user.id,
      productId,
      storeTransactionId: transactionId,
      store,
      source: 'client',
    });

    return res.json({
      success: true,
      data: {
        coinsBalance: result.coinsBalance,
        tokensGranted: result.tokensGranted,
        credited: result.credited,
        duplicate: Boolean(result.duplicate),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * RevenueCat server webhook.
 * Dashboard → Integrations → Webhooks:
 *   URL: https://zovi.fly-work.com/billing/revenuecat/webhook
 *   Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH>
 */
router.post('/revenuecat/webhook', async (req, res) => {
  if (!webhookAuthorized(req)) {
    logger.warn('revenuecat_webhook_unauthorized');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid webhook auth' },
    });
  }

  try {
    const event = req.body?.event || req.body;
    const result = await iap.handleRevenueCatWebhook(event || {});
    logger.info('revenuecat_webhook_ok', {
      type: event?.type,
      result,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('revenuecat_webhook_failed', {
      message: err.message,
      code: err.code,
    });
    // Still 200 for unknown products / ignore cases already handled above;
    // only unexpected errors return 500 so RC retries.
    const status = err.status && err.status < 500 ? err.status : 500;
    return res.status(status).json({
      success: false,
      error: {
        code: err.code || 'WEBHOOK_FAILED',
        message: err.message || 'Webhook failed',
      },
    });
  }
});

module.exports = router;
