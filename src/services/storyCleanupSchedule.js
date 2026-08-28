'use strict';

const { query } = require('../config/database');
const { BunnyStorageService } = require('./BunnyStorageService');
const { logger } = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;
const BOOT_DELAY_MS = 60 * 1000; // let the server settle before the first pass
// Purge stories this long after they expire — a small buffer past the 24h
// story TTL, not a user-facing grace period (expired stories are already
// unreadable via the `expires_at` filter on every read).
const GRACE_HOURS = 24;
const BATCH_SIZE = 200;

const bunny = new BunnyStorageService();

async function purgeOnce(trigger) {
  let deleted = 0;
  try {
    for (;;) {
      const rows = await query(
        `SELECT id, storage_key FROM stories
         WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR)
         LIMIT ?`,
        [GRACE_HOURS, BATCH_SIZE],
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        if (row.storage_key) {
          // Best-effort — BunnyStorageService already retries transient
          // failures internally; a stale CDN object is cheap to leak, a
          // stuck cleanup loop is not.
          await bunny.deleteObject(row.storage_key).catch(() => {});
        }
      }

      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      // story_views / story_likes cascade via FK ON DELETE CASCADE.
      await query(`DELETE FROM stories WHERE id IN (${placeholders})`, ids);
      deleted += rows.length;

      if (rows.length < BATCH_SIZE) break;
    }
    logger.info('story_cleanup_run', { trigger, deleted });
  } catch (err) {
    logger.error('story_cleanup_run_failed', { trigger, deleted, err });
  }
}

/**
 * In-process daily purge of expired stories (DB + Bunny CDN). Same
 * dependency-free setInterval pattern as tribeFormationSchedule.
 */
function startStoryCleanupSchedule() {
  if (String(process.env.STORY_CLEANUP_DISABLED || '') === '1') {
    logger.info('story_cleanup_disabled');
    return;
  }
  const boot = setTimeout(() => purgeOnce('boot'), BOOT_DELAY_MS);
  const daily = setInterval(() => purgeOnce('interval'), DAY_MS);
  boot.unref?.();
  daily.unref?.();
}

module.exports = { startStoryCleanupSchedule };
