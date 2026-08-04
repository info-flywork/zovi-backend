'use strict';

const { verifyIdToken } = require('../config/firebase');
const { AuthService } = require('../services/AuthService');
const { logger } = require('../utils/logger');

const authService = new AuthService();

async function requireFirebaseAuth(req, res, next) {
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
    req.firebase = decoded;

    let user = await authService.users.findByFirebaseUid(decoded.uid);
    if (!user) {
      const synced = await authService.syncFromFirebase(decoded);
      user = synced.user;
    }

    req.user = user;
    return next();
  } catch (err) {
    logger.warn('auth_middleware_failed', {
      message: err.message,
      code: err.code,
    });
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired Firebase token' },
    });
  }
}

module.exports = { requireFirebaseAuth, authService };
