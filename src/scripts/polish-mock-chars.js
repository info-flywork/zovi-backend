'use strict';

/**
 * Keep only mock characters whose CDN portrait exists, then mix stamps /
 * private accounts / no-stamp pins around the live viewer.
 *
 *   node src/scripts/polish-mock-chars.js
 */

const { query, closePool } = require('../config/database');
const { logger } = require('../utils/logger');

async function urlExists(url) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return true;
    const get = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-8' },
    });
    return get.ok;
  } catch (_) {
    return false;
  }
}

async function run() {
  const mocks = await query(
    `SELECT u.id, up.full_name, up.avatar_url
     FROM users u
     INNER JOIN user_profiles up ON up.user_id = u.id
     WHERE u.firebase_uid LIKE 'zovi_mock_char%'
       AND u.deleted_at IS NULL`,
  );
  logger.info('polish_mock_scan', { count: mocks.length });

  const missing = [];
  const present = [];
  const chunk = 12;
  for (let i = 0; i < mocks.length; i += chunk) {
    const slice = mocks.slice(i, i + chunk);
    const flags = await Promise.all(
      slice.map((row) => urlExists(String(row.avatar_url || '').trim())),
    );
    slice.forEach((row, idx) => {
      if (flags[idx]) present.push(row);
      else missing.push(row);
    });
    logger.info('polish_mock_probe', { done: Math.min(i + chunk, mocks.length) });
  }

  for (const row of missing) {
    await query(
      `UPDATE users SET status = 'deleted', deleted_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [row.id],
    );
    await query('DELETE FROM map_presence WHERE user_id = ?', [row.id]);
    await query(
      `UPDATE check_ins SET is_active_on_map = 0, deleted_at = UTC_TIMESTAMP(3)
       WHERE user_id = ? AND deleted_at IS NULL`,
      [row.id],
    );
  }

  const stamps = await query(
    `SELECT id, slug FROM stamps WHERE is_active = 1 ORDER BY sort_order ASC`,
  );
  if (!stamps.length) {
    throw new Error('no stamps catalog');
  }

  let privateCount = 0;
  let noStampCount = 0;
  let stampedCount = 0;

  for (let i = 0; i < present.length; i += 1) {
    const id = present[i].id;
    const bucket = i % 10;
    await query('DELETE FROM user_stamps WHERE user_id = ?', [id]);

    if (bucket <= 1) {
      privateCount += 1;
      await query(
        `UPDATE user_profiles SET account_privacy = 'friends' WHERE user_id = ?`,
        [id],
      );
      await query(
        `UPDATE map_presence SET is_anonymous = 1, updated_at = UTC_TIMESTAMP(3)
         WHERE user_id = ?`,
        [id],
      );
      await query(
        `UPDATE check_ins SET is_active_on_map = 0 WHERE user_id = ?`,
        [id],
      );
      continue;
    }

    await query(
      `UPDATE user_profiles SET account_privacy = 'public' WHERE user_id = ?`,
      [id],
    );
    await query(
      `UPDATE map_presence SET is_anonymous = 0, updated_at = UTC_TIMESTAMP(3)
       WHERE user_id = ?`,
      [id],
    );

    if (bucket <= 3) {
      noStampCount += 1;
      await query(
        `UPDATE check_ins SET is_active_on_map = 0 WHERE user_id = ?`,
        [id],
      );
      continue;
    }

    stampedCount += 1;
    const stamp = stamps[i % stamps.length];
    await query(
      `INSERT IGNORE INTO user_stamps (user_id, stamp_id, source)
       VALUES (?, ?, 'seed')`,
      [id, stamp.id],
    );
    await query(
      `UPDATE check_ins
       SET is_active_on_map = 1, deleted_at = NULL, checked_at = UTC_TIMESTAMP(3)
       WHERE user_id = ?`,
      [id],
    );
  }

  logger.info('polish_mock_done', {
    kept: present.length,
    hiddenMissingPhoto: missing.length,
    privateCount,
    noStampCount,
    stampedCount,
  });
  // eslint-disable-next-line no-console
  console.log({
    kept: present.length,
    hiddenMissingPhoto: missing.length,
    privateCount,
    noStampCount,
    stampedCount,
  });
}

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
