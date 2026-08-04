'use strict';

const express = require('express');
const { healthCheck } = require('../config/database');
const { env } = require('../config/env');

const router = express.Router();

router.get('/', async (_req, res) => {
  const db = await healthCheck();
  const status = db.ok ? 200 : 503;

  res.status(status).json({
    success: db.ok,
    data: {
      service: 'zovi-apis',
      env: env.nodeEnv,
      uptimeSec: Math.floor(process.uptime()),
      db,
    },
  });
});

router.get('/db', async (_req, res) => {
  const db = await healthCheck();
  res.status(db.ok ? 200 : 503).json({ success: db.ok, data: db });
});

module.exports = router;
