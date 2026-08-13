'use strict';

const { formTribes } = require('./TribeFormationService');
const { logger } = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;
const BOOT_DELAY_MS = 30 * 1000; // let the server settle before the first pass

function envInt(name) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

async function runOnce(trigger) {
  try {
    const result = await formTribes({
      minMembers: envInt('TRIBE_MIN_MEMBERS'),
      minCheckIns: envInt('TRIBE_MIN_CHECKINS'),
      windowDays: envInt('TRIBE_WINDOW_DAYS'),
    });
    logger.info('tribe_formation_run', { trigger, ...result });
  } catch (err) {
    logger.error('tribe_formation_run_failed', { trigger, err });
  }
}

/**
 * In-process nightly tribe formation. Dependency-free (no node-cron): one pass
 * shortly after boot, then every 24h. The standalone `npm run tribes:form`
 * script runs the exact same pass for manual/OS-cron use.
 */
function startTribeFormationSchedule() {
  if (String(process.env.TRIBE_FORMATION_DISABLED || '') === '1') {
    logger.info('tribe_formation_disabled');
    return;
  }
  const boot = setTimeout(() => runOnce('boot'), BOOT_DELAY_MS);
  const daily = setInterval(() => runOnce('interval'), DAY_MS);
  boot.unref?.();
  daily.unref?.();
}

module.exports = { startTribeFormationSchedule };
