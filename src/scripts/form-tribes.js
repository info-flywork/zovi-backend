'use strict';

/**
 * One-shot tribe formation backfill.
 *
 *   node src/scripts/form-tribes.js
 *
 * Turns existing check-in behaviour into tribes + memberships right now. Safe to
 * re-run. The same formTribes() runs nightly via the in-process scheduler.
 * Thresholds are overridable by env for tuning against real traffic:
 *   TRIBE_MIN_MEMBERS, TRIBE_MIN_CHECKINS, TRIBE_WINDOW_DAYS
 */

const { formTribes } = require('../services/TribeFormationService');
const { closePool } = require('../config/database');
const { logger } = require('../utils/logger');

function envInt(name) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

async function run() {
  const result = await formTribes({
    minMembers: envInt('TRIBE_MIN_MEMBERS'),
    minCheckIns: envInt('TRIBE_MIN_CHECKINS'),
    windowDays: envInt('TRIBE_WINDOW_DAYS'),
  });
  logger.info('form_tribes_done', result);
  // eslint-disable-next-line no-console
  console.log('Tribe formation complete:', result);
}

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('form_tribes_failed', err);
    // eslint-disable-next-line no-console
    console.error(err);
    await closePool();
    process.exit(1);
  });
