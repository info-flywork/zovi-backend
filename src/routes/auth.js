'use strict';

const express = require('express');
const { verifyIdToken } = require('../config/firebase');
const { authService, requireFirebaseAuth } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

function packAuthPayload(result) {
  return {
    nextStep: result.nextStep,
    user: result.user.toJSON(),
    profile: result.profile.toJSON(),
    onboarding: result.onboarding.toJSON(),
    settings: result.settings.toJSON(),
    links: (result.links || []).map((link) => link.toJSON()),
  };
}

/**
 * POST /auth/sync
 * Body optional. Authorization: Bearer <Firebase ID token>
 * Verifies Firebase token and upserts MySQL user/profile rows.
 */
router.post('/sync', async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      });
    }

    const decoded = await verifyIdToken(match[1]);
    const result = await authService.syncFromFirebase(decoded);

    logger.info('auth_sync_ok', {
      userId: result.user.id,
      created: result.created,
      nextStep: result.nextStep,
      primaryAuth: result.user.primaryAuth,
    });

    return res.json({
      success: true,
      data: {
        created: result.created,
        ...packAuthPayload(result),
      },
    });
  } catch (err) {
    if (err.code === 'auth/id-token-expired' || err.code === 'auth/argument-error') {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: err.message },
      });
    }
    return next(err);
  }
});

router.get('/me', requireFirebaseAuth, async (req, res, next) => {
  try {
    const result = await authService.getMe(req.user.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }
    return res.json({ success: true, data: packAuthPayload(result) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
