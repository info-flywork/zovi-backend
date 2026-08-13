'use strict';

/**
 * Seed realistic test data so tribes form with real members + avatars.
 *
 *   node src/scripts/seed-test-users.js
 *
 * Creates test users (with pravatar photos), category venues per district,
 * multi-day check-ins, then runs formation and pre-joins the fixtures so the
 * Tribe screen is populated for any real user. Idempotent.
 */

const { query, closePool } = require('../config/database');
const { formTribes } = require('../services/TribeFormationService');
const { logger } = require('../utils/logger');

const USER_COUNT = 24;

const FIRST_NAMES = [
  'Deniz', 'Ela', 'Kaan', 'Selin', 'Mert', 'Ada', 'Ege', 'Naz',
  'Can', 'Zeynep', 'Arda', 'Lara', 'Emir', 'Derya', 'Bora', 'Ceren',
  'Kerem', 'Melis', 'Efe', 'İpek', 'Onur', 'Buse', 'Tolga', 'Sıla',
];

// district key + category define which tribe a cluster feeds.
const CLUSTERS = [
  { key: 'kadikoy', category: 'cafe', lat: 40.9903, lng: 29.0275, place: 'Moda Sahil Kahve' },
  { key: 'besiktas', category: 'gym', lat: 41.0430, lng: 29.0075, place: 'Beşiktaş Sahil Spor' },
  { key: 'beyoglu', category: 'restaurant', lat: 41.0362, lng: 28.9773, place: 'Asmalımescit Meydan' },
  { key: 'fatih', category: 'culture', lat: 41.0186, lng: 28.9497, place: 'Sultanahmet Müze Hattı' },
  { key: 'sisli', category: 'cafe', lat: 41.0602, lng: 28.9870, place: 'Nişantaşı Kahveci' },
  { key: 'kadikoy', category: 'music', lat: 40.9880, lng: 29.0300, place: 'Kadıköy Sahne' },
];

// The editorial featured hero tribe (from migration 026) -- pre-join a crowd so
// the "Algoritma seni ekledi" card always shows real faces.
const FEATURED_TRIBE_ID = 'b1000000-0000-4000-8000-000000000001';
const FEATURED_MEMBER_COUNT = 8;

function hex12(n) {
  return n.toString(16).padStart(12, '0');
}

function userId(i) {
  return `d0000000-0000-4000-8000-${hex12(i)}`;
}

function venueId(i) {
  return `e0000000-0000-4000-8000-${hex12(i)}`;
}

function checkInId(userIdx, clusterIdx, day) {
  return `c0000000-0000-4000-8000-${hex12(userIdx * 10000 + clusterIdx * 100 + day)}`;
}

async function seedUsers() {
  const ids = [];
  for (let i = 0; i < USER_COUNT; i += 1) {
    const id = userId(i);
    ids.push(id);
    const name = FIRST_NAMES[i % FIRST_NAMES.length];
    const username = `zovi_test_${i}`;
    const avatar = `https://i.pravatar.cc/300?img=${(i % 70) + 1}`;

    await query(
      `INSERT INTO users (id, firebase_uid, primary_auth, status)
       VALUES (?, ?, 'phone', 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [id, `zovi_test_uid_${i}`],
    );
    await query(
      `INSERT INTO user_profiles (user_id, full_name, username, avatar_url, location_text)
       VALUES (?, ?, ?, ?, 'İstanbul')
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         avatar_url = VALUES(avatar_url)`,
      [id, name, username, avatar],
    );
  }
  return ids;
}

async function seedVenues() {
  for (let c = 0; c < CLUSTERS.length; c += 1) {
    const cluster = CLUSTERS[c];
    await query(
      `INSERT INTO venues (id, name, category, district, subtitle, lat, lng, place_key)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category = VALUES(category),
         district = VALUES(district),
         lat = VALUES(lat),
         lng = VALUES(lng)`,
      [
        venueId(c),
        cluster.place,
        cluster.category,
        cluster.key,
        cluster.lat,
        cluster.lng,
        `seed_${cluster.key}_${cluster.category}`,
      ],
    );
  }
}

/**
 * Assign each user a primary cluster (12 active days -> unlocks the tribe) and
 * every 3rd user a secondary cluster with fewer days (stays "eligible").
 */
async function seedCheckIns(userIds) {
  for (let i = 0; i < userIds.length; i += 1) {
    const id = userIds[i];
    const assignments = [{ clusterIdx: i % CLUSTERS.length, days: 12 }];
    if (i % 3 === 0) {
      assignments.push({ clusterIdx: (i + 2) % CLUSTERS.length, days: 5 });
    }

    for (const { clusterIdx, days } of assignments) {
      const cluster = CLUSTERS[clusterIdx];
      for (let day = 1; day <= days; day += 1) {
        await query(
          `INSERT IGNORE INTO check_ins
             (id, user_id, venue_id, place_name, lat, lng, photo_privacy,
              is_active_on_map, checked_at)
           VALUES (?, ?, ?, ?, ?, ?, 'public', 0,
                   DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [
            checkInId(i, clusterIdx, day),
            id,
            venueId(clusterIdx),
            cluster.place,
            cluster.lat,
            cluster.lng,
            day,
          ],
        );
      }
    }
  }
}

async function syncCheckInCounts(userIds) {
  for (const id of userIds) {
    await query(
      `UPDATE user_profiles up
       SET check_ins_count = (
         SELECT COUNT(*) FROM check_ins ci
         WHERE ci.user_id = up.user_id AND ci.deleted_at IS NULL
       )
       WHERE up.user_id = ?`,
      [id],
    );
  }
}

/** Fixtures simulate people who already opted in -> promote to real members. */
async function promoteFixturesToMembers(userIds) {
  const placeholders = userIds.map(() => '?').join(',');
  await query(
    `UPDATE tribe_members
     SET state = 'member',
         joined_at = COALESCE(joined_at, CURRENT_TIMESTAMP(3)),
         unlocked_at = COALESCE(unlocked_at, CURRENT_TIMESTAMP(3))
     WHERE user_id IN (${placeholders}) AND progress >= 8`,
    userIds,
  );
}

async function seedFeaturedMembers(userIds) {
  for (let i = 0; i < Math.min(FEATURED_MEMBER_COUNT, userIds.length); i += 1) {
    await query(
      `INSERT INTO tribe_members
         (tribe_id, user_id, state, progress, joined_at, unlocked_at, last_progress_at)
       VALUES (?, ?, 'member', 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE state = 'member'`,
      [FEATURED_TRIBE_ID, userIds[i]],
    );
  }
}

async function awardStamps(userIds) {
  const rows = await query(
    `SELECT id FROM stamps WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 1`,
  );
  const stampId = rows[0]?.id;
  if (!stampId) return;
  for (const id of userIds) {
    await query(
      `INSERT IGNORE INTO user_stamps (user_id, stamp_id, source)
       VALUES (?, ?, 'seed')`,
      [id, stampId],
    );
  }
}

async function refreshAllMemberCounts() {
  await query(
    `UPDATE tribes t
     SET member_count_cache = (
       SELECT COUNT(*) FROM tribe_members m
       WHERE m.tribe_id = t.id AND m.state = 'member'
     )`,
  );
}

async function run() {
  logger.info('seed_test_users_start', { userCount: USER_COUNT });

  const userIds = await seedUsers();
  await seedVenues();
  await seedCheckIns(userIds);
  await syncCheckInCounts(userIds);

  // Form tribes from the freshly seeded behaviour, then pre-join fixtures.
  const formation = await formTribes({ minMembers: 3, minCheckIns: 3 });
  logger.info('seed_formation', formation);

  await promoteFixturesToMembers(userIds);
  await seedFeaturedMembers(userIds);
  await awardStamps(userIds);
  await refreshAllMemberCounts();

  const counts = await query(
    `SELECT name, member_count_cache AS members FROM tribes
     ORDER BY member_count_cache DESC`,
  );
  logger.info('seed_test_users_done', { tribes: counts });
  // eslint-disable-next-line no-console
  console.table(counts);
}

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('seed_test_users_failed', err);
    // eslint-disable-next-line no-console
    console.error(err);
    await closePool();
    process.exit(1);
  });
