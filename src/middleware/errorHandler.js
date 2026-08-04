'use strict';

const { logger } = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}

function errorHandler(err, req, res, next) {
  logger.error('unhandled_error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'Internal server error' : err.message,
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
