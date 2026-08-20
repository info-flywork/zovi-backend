'use strict';

/**
 * Put mock characters into catalog tribes (and their group chats) by default.
 *
 *   npm run seed:mock-tribes
 *
 * Idempotent. Creates tribe conversations, memberships, and a few starter
 * group messages so chats feel alive.
 */

const { query, closePool } = require('../config/database');
const { TribeRepository } = require('../services/TribeRepository');
const { ChatRepository } = require('../services/ChatRepository');
const { logger } = require('../utils/logger');
const { MOCK_FIREBASE_PREFIX } = require('../services/MockChatService');

const TRIBES_LIMIT = 16;
const MEMBERS_PER_TRIBE = 14;
const STARTER_MESSAGES_PER_TRIBE = 4;

const STARTER_TEXTS = [
  'Kim bu hafta geliyor?',
  'Ben burdayım 👋',
  'Check-in atınca yazın',
  'Buluşma noktası neresi olsun?',
  'Sticker time 👇',
  'Sesli mesaj geliyor',
  'Hava çok güzel bugün',
  'Sayaç tuttu 🔥',
];

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadMockUserIds() {
  const rows = await query(
    `SELECT u.id AS userId
     FROM users u
     WHERE u.status = 'active'
       AND u.firebase_uid LIKE ?
     ORDER BY u.created_at ASC`,
    [`${MOCK_FIREBASE_PREFIX}%`],
  );
  return rows.map((r) => String(r.userId));
}

async function loadCatalogTribes() {
  const rows = await query(
    `SELECT id, name, threshold, area_key AS areaKey
     FROM tribes
     WHERE status = 'active'
       AND area_key LIKE 'catalog-%'
     ORDER BY sort_order ASC
     LIMIT ?`,
    [TRIBES_LIMIT],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || ''),
    threshold: Number(r.threshold) || 1,
    areaKey: String(r.areaKey || ''),
  }));
}

async function loadStamps() {
  const rows = await query(
    `SELECT id, cdn_url AS cdnUrl
     FROM stamps
     WHERE is_active = 1
       AND cdn_url IS NOT NULL
       AND TRIM(cdn_url) <> ''
     ORDER BY sort_order ASC
     LIMIT 40`,
  );
  return rows
    .map((r) => ({
      id: String(r.id || ''),
      url: String(r.cdnUrl || '').trim(),
    }))
    .filter((r) => r.url);
}

async function loadVoiceSamples() {
  const rows = await query(
    `SELECT media_url AS mediaUrl, body
     FROM messages
     WHERE type = 'voice'
       AND media_url IS NOT NULL
       AND TRIM(media_url) <> ''
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 12`,
  );
  return rows
    .map((r) => ({
      url: String(r.mediaUrl || '').trim(),
      durationMs: String(r.body || '2400').replace(/\D/g, '') || '2400',
    }))
    .filter((r) => r.url);
}

async function upsertMember(tribeId, userId, threshold) {
  await query(
    `INSERT INTO tribe_members
       (tribe_id, user_id, state, progress, joined_at, unlocked_at, last_progress_at)
     VALUES (?, ?, 'member', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       state = 'member',
       progress = GREATEST(progress, VALUES(progress)),
       joined_at = COALESCE(joined_at, VALUES(joined_at)),
       unlocked_at = COALESCE(unlocked_at, VALUES(unlocked_at))`,
    [tribeId, userId, threshold],
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

async function seedStarterMessages({
  conversationId,
  memberIds,
  stamps,
  voices,
  chat,
}) {
  if (!conversationId || !memberIds.length) return 0;

  const existing = await query(
    `SELECT COUNT(*) AS c
     FROM messages
     WHERE conversation_id = ?
       AND deleted_at IS NULL`,
    [conversationId],
  );
  if (Number(existing[0]?.c || 0) >= STARTER_MESSAGES_PER_TRIBE) {
    return 0;
  }

  const senders = shuffle(memberIds).slice(0, STARTER_MESSAGES_PER_TRIBE);
  let inserted = 0;
  for (let i = 0; i < senders.length; i += 1) {
    const senderId = senders[i];
    const roll = Math.random();
    let type = 'text';
    let body = STARTER_TEXTS[i % STARTER_TEXTS.length];
    let mediaUrl = null;

    if (roll > 0.72 && stamps.length) {
      const stamp = stamps[i % stamps.length];
      type = 'stamp';
      body = stamp.id || 'stamp';
      mediaUrl = stamp.url;
    } else if (roll > 0.55 && voices.length) {
      const voice = voices[i % voices.length];
      type = 'voice';
      body = voice.durationMs;
      mediaUrl = voice.url;
    }

    await chat.insertMessage({
      conversationId,
      senderId,
      type,
      body,
      mediaUrl,
    });
    inserted += 1;
  }
  return inserted;
}

async function main() {
  const tribes = new TribeRepository();
  const chat = new ChatRepository();

  const [mockIds, catalog, stamps, voices] = await Promise.all([
    loadMockUserIds(),
    loadCatalogTribes(),
    loadStamps(),
    loadVoiceSamples(),
  ]);

  if (!mockIds.length) {
    throw new Error('No mock users found. Run npm run seed:mock-chars first.');
  }
  if (!catalog.length) {
    throw new Error('No catalog tribes found.');
  }

  logger.info('seed_mock_tribes_start', {
    mocks: mockIds.length,
    tribes: catalog.length,
    membersPerTribe: MEMBERS_PER_TRIBE,
  });

  const pool = shuffle(mockIds);
  let memberships = 0;
  let messages = 0;

  for (let t = 0; t < catalog.length; t += 1) {
    const tribe = catalog[t];
    const start = (t * MEMBERS_PER_TRIBE) % pool.length;
    const members = [];
    for (let i = 0; i < MEMBERS_PER_TRIBE; i += 1) {
      members.push(pool[(start + i) % pool.length]);
    }
    const uniqueMembers = [...new Set(members)];

    for (const userId of uniqueMembers) {
      await upsertMember(tribe.id, userId, tribe.threshold);
      memberships += 1;
    }

    const conversationId = await tribes.ensureConversation(tribe.id);
    await tribes.syncConversationMembers(tribe.id, conversationId);
    await refreshMemberCount(tribe.id);

    const added = await seedStarterMessages({
      conversationId,
      memberIds: uniqueMembers,
      stamps,
      voices,
      chat,
    });
    messages += added;

    logger.info('seed_mock_tribes_tribe', {
      tribe: tribe.name,
      members: uniqueMembers.length,
      conversationId,
      starterMessages: added,
    });
  }

  logger.info('seed_mock_tribes_done', { memberships, messages });
}

main()
  .catch((err) => {
    logger.error('seed_mock_tribes_failed', {
      error: err?.message || String(err),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
