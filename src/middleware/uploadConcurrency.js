'use strict';

const { logger } = require('../utils/logger');

/**
 * Bounds how many large in-memory uploads (multer memoryStorage — stories,
 * drafts, pulses) can be buffering at once. Without this, a burst of
 * concurrent 50MB video uploads has no backpressure and can push the process
 * toward OOM. Single process-local counter — fine for the current
 * single-instance deployment.
 */
function uploadConcurrencyGuard({ max = 8 } = {}) {
  let active = 0;

  return function guard(req, res, next) {
    if (active >= max) {
      logger.warn('upload_concurrency_rejected', { active, max, path: req.originalUrl });
      res.set('Retry-After', '2');
      return res.status(503).json({
        success: false,
        error: {
          code: 'UPLOAD_BUSY',
          message: 'Too many uploads in progress, please retry shortly',
        },
      });
    }

    active += 1;
    const release = () => {
      active = Math.max(0, active - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    return next();
  };
}

module.exports = { uploadConcurrencyGuard };
