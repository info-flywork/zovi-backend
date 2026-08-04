'use strict';

const { logger } = require('../utils/logger');

function requestLogger(req, res, next) {
  const started = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    logger.http('request', {
      method,
      path: originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - started,
      ip: req.ip,
      userId: req.user?.id || null,
    });
  });

  next();
}

module.exports = { requestLogger };
