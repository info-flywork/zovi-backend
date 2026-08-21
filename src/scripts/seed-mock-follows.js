'use strict';

/**
 * Seed sparse follow graph among mock characters so profiles show followers.
 *
 *   node src/scripts/seed-mock-follows.js
 *
 * Idempotent (INSERT IGNORE). Also refreshes followers/following counts.
 */

const { query, closePool } = require('../config/database');
const { logger } = require('../utils/logger');

const MOCK_FIREBASE_PREFIX = 'zovi_mock_char_';
const FOLLOWS_PER_USER_MIN = 4;
const FOLLOWS_PER_USER_MAX = 12;

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function main() {
  const mocks = await query(
    `SELECT u.id AS userId
     FROM users u
     WHERE u.deleted_at IS NULL
       AND u.firebase_uid LIKE ?
     ORDER BY u.created_at ASC, u.id ASC`,
    [`${MOCK_FIREBASE_PREFIX}%`],
  );
  const ids = mocks.map((r) => String(r.userId));
  if (ids.length < 2) {
    logger.warn('seed_mock_follows_skipped', { reason: 'not_enough_mocks' });
    return;
  }

  let inserted = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const followerId = ids[i];
    const h = hash32(followerId);
    const want =
      FOLLOWS_PER_USER_MIN +
      (h % (FOLLOWS_PER_USER_MAX - FOLLOWS_PER_USER_MIN + 1));
    const picked = new Set();
    let guard = 0;
    while (picked.size < want && guard < ids.length * 3) {
      guard += 1;
      const idx = (h + guard * 17 + i * 3) % ids.length;
      const followingId = ids[idx];
      if (followingId === followerId) continue;
      picked.add(followingId);
    }

    for (const followingId of picked) {
      const result = await query(
        `INSERT IGNORE INTO follows (follower_id, following_id)
         VALUES (?, ?)`,
        [followerId, followingId],
      );
      if (result?.affectedRows > 0) inserted += 1;
    }
  }

  // Rebuild counts from follows (mock + real).
  await query(
    `UPDATE user_profiles up
     SET followers_count = (
           SELECT COUNT(*) FROM follows f WHERE f.following_id = up.user_id
         ),
         following_count = (
           SELECT COUNT(*) FROM follows f WHERE f.follower_id = up.user_id
         )`,
  );

  logger.info('seed_mock_follows_done', {
    mocks: ids.length,
    inserted,
  });
}

main()
  .catch((err) => {
    logger.error('seed_mock_follows_failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
