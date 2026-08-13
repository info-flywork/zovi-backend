'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { districtForCoords, districtLabel } = require('../utils/istanbulDistricts');

// Auto-generated tribe naming per category. Editorial/seed tribes keep their
// own names -- formation only sets these on freshly inserted rows.
const CATEGORY_META = {
  music: { word: 'Müzik Sahnesi', emoji: '🎵' },
  cafe: { word: 'Kahve Ritüeli', emoji: '☕' },
  park: { word: 'Doğa Rotası', emoji: '🌳' },
  culture: { word: 'Kültür Rotası', emoji: '🏛️' },
  restaurant: { word: 'Lezzet Durağı', emoji: '🍽️' },
  gym: { word: 'Sporcuları', emoji: '🏃' },
  other: { word: 'Topluluğu', emoji: '✨' },
};

function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.other;
}

const DEFAULTS = {
  windowDays: 30,
  minMembers: 3, // users per (district,category) needed to spin up a tribe
  minCheckIns: 3, // distinct check-in days that make a user "qualifying"
  threshold: 10, // distinct days that unlock membership (the "x/10")
};

/**
 * Backfill venues.district from lat/lng for any row still missing it.
 * @returns {Promise<number>} rows updated
 */
async function backfillVenueDistricts() {
  const rows = await query(
    `SELECT id, lat, lng FROM venues WHERE district IS NULL`,
  );
  let updated = 0;
  for (const row of rows) {
    const match = districtForCoords(row.lat, row.lng);
    if (!match) continue;
    await query(`UPDATE venues SET district = ? WHERE id = ?`, [
      match.key,
      row.id,
    ]);
    updated += 1;
  }
  return updated;
}

async function upsertTribe(districtKey, category) {
  const meta = categoryMeta(category);
  const label = districtLabel(districtKey) || districtKey;
  const name = `${label} ${meta.word}`;
  const description = `${label} çevresinde aynı rutini paylaşan topluluk.`;

  // Insert if new; never clobber an editorial/seed row's copy on conflict.
  await query(
    `INSERT INTO tribes
       (id, category, area_key, area_label, name, description, emoji,
        cadence_label, threshold, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Yakınında aktif', ?, 'active', 100)
     ON DUPLICATE KEY UPDATE
       status = 'active',
       area_label = COALESCE(area_label, VALUES(area_label)),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      randomUUID(),
      category,
      districtKey,
      label,
      name,
      description,
      meta.emoji,
      DEFAULTS.threshold,
    ],
  );

  const rows = await query(
    `SELECT id, threshold FROM tribes WHERE area_key = ? AND category = ? LIMIT 1`,
    [districtKey, category],
  );
  return rows[0] || null;
}

/**
 * Assign a progressing (eligible) membership. Opt-in is preserved: formation
 * never sets state='member' -- that only happens when the user taps "Join" or
 * the test seeder pre-joins fixtures. Existing members are never downgraded.
 */
async function upsertMembership(tribeId, userId, days, threshold) {
  const progress = Math.min(days, threshold);
  const unlocked = days >= threshold;
  await query(
    `INSERT INTO tribe_members
       (tribe_id, user_id, state, progress, unlocked_at, last_progress_at)
     VALUES (?, ?, 'eligible', ?, ${unlocked ? 'CURRENT_TIMESTAMP(3)' : 'NULL'}, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       state = IF(tribe_members.state = 'member', 'member', 'eligible'),
       progress = VALUES(progress),
       unlocked_at = COALESCE(tribe_members.unlocked_at, VALUES(unlocked_at)),
       last_progress_at = CURRENT_TIMESTAMP(3)`,
    [tribeId, userId, progress],
  );
}

async function refreshMemberCount(tribeId) {
  await query(
    `UPDATE tribes t
     SET member_count_cache = (
       SELECT COUNT(*) FROM tribe_members m
       WHERE m.tribe_id = t.id AND m.state = 'member'
     )
     WHERE t.id = ?`,
    [tribeId],
  );
}

/**
 * Core formation pass: turn recent check-in behaviour into tribes + memberships.
 * Idempotent and safe to run repeatedly (backfill now, cron nightly).
 *
 * @returns {Promise<{ tribesFormed: number, membersAssigned: number, districtsBackfilled: number }>}
 */
async function formTribes(options = {}) {
  // Use `??` per-field so an explicit `undefined` (e.g. unset env override)
  // never clobbers a default — that would send undefined to a SQL bind.
  const cfg = {
    windowDays: options.windowDays ?? DEFAULTS.windowDays,
    minMembers: options.minMembers ?? DEFAULTS.minMembers,
    minCheckIns: options.minCheckIns ?? DEFAULTS.minCheckIns,
    threshold: options.threshold ?? DEFAULTS.threshold,
  };
  const districtsBackfilled = await backfillVenueDistricts();

  const rows = await query(
    `SELECT
       ci.user_id AS userId,
       v.district AS district,
       LOWER(TRIM(COALESCE(v.category, 'other'))) AS category,
       COUNT(DISTINCT DATE(ci.checked_at)) AS days
     FROM check_ins ci
     INNER JOIN venues v ON v.id = ci.venue_id
     WHERE ci.deleted_at IS NULL
       AND v.district IS NOT NULL
       AND ci.checked_at >= (NOW() - INTERVAL ? DAY)
     GROUP BY ci.user_id, v.district, category`,
    [cfg.windowDays],
  );

  // bucket key "district|category" -> [{ userId, days }]
  const buckets = new Map();
  for (const row of rows) {
    const key = `${row.district}|${row.category}`;
    const list = buckets.get(key) || [];
    list.push({ userId: String(row.userId), days: Number(row.days) || 0 });
    buckets.set(key, list);
  }

  let tribesFormed = 0;
  let membersAssigned = 0;

  for (const [key, participants] of buckets) {
    const qualifying = participants.filter((p) => p.days >= cfg.minCheckIns);
    if (qualifying.length < cfg.minMembers) continue;

    const [districtKey, category] = key.split('|');
    const tribe = await upsertTribe(districtKey, category);
    if (!tribe) continue;
    tribesFormed += 1;

    const threshold = Number(tribe.threshold) || cfg.threshold;
    for (const p of participants) {
      await upsertMembership(tribe.id, p.userId, p.days, threshold);
      membersAssigned += 1;
    }
    await refreshMemberCount(tribe.id);
  }

  return { tribesFormed, membersAssigned, districtsBackfilled };
}

module.exports = { formTribes, backfillVenueDistricts, DEFAULTS };
