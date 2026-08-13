'use strict';

const express = require('express');
const { env } = require('./config/env');
const { healthCheck, closePool } = require('./config/database');
const { initFirebase } = require('./config/firebase');
const { logger } = require('./utils/logger');
const { requestLogger } = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const stampRoutes = require('./routes/stamps');
const musicRoutes = require('./routes/music');
const storyRoutes = require('./routes/stories');
const draftRoutes = require('./routes/drafts');
const socialRoutes = require('./routes/social');
const chatRoutes = require('./routes/chat');
const pulseRoutes = require('./routes/pulses');
const mapRoutes = require('./routes/map');
const checkInRoutes = require('./routes/checkIns');
const tribeRoutes = require('./routes/tribes');
const {
  startTribeFormationSchedule,
} = require('./services/tribeFormationSchedule');

async function bootstrap() {
  initFirebase();

  const db = await healthCheck();
  if (!db.ok) {
    logger.error('startup_db_unhealthy', db);
    process.exit(1);
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: { name: 'zovi-apis', version: '1.0.0' },
    });
  });

  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/stamps', stampRoutes);
  app.use('/music', musicRoutes);
  app.use('/stories', storyRoutes);
  app.use('/drafts', draftRoutes);
  app.use('/social', socialRoutes);
  app.use('/chat', chatRoutes);
  app.use('/pulses', pulseRoutes);
  app.use('/map', mapRoutes);
  app.use('/check-ins', checkInRoutes);
  app.use('/tribes', tribeRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(env.port, () => {
    logger.info('server_started', {
      port: env.port,
      env: env.nodeEnv,
      db: db.database,
      latencyMs: db.latencyMs,
    });
  });

  // Nightly algorithmic tribe formation (in-process, dependency-free).
  startTribeFormationSchedule();

  const shutdown = async (signal) => {
    logger.info('shutdown', { signal });
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('bootstrap_failed', err);
  process.exit(1);
});
