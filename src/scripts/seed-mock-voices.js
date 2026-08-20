'use strict';

/**
 * Fetch ElevenLabs voices and assign a random voice_id to every mock character.
 *
 *   npm run seed:mock-voices
 *
 * Requires ELEVENLABS_API_KEY in backend/.env
 * Idempotent: re-runs reshuffle and overwrite existing assignments.
 */

const { env } = require('../config/env');
const { query, closePool } = require('../config/database');
const { logger } = require('../utils/logger');
const { MOCK_FIREBASE_PREFIX } = require('../services/MockChatService');

const VOICES_URL = 'https://api.elevenlabs.io/v1/voices';

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchElevenVoices(apiKey) {
  const response = await fetch(VOICES_URL, {
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `ElevenLabs /v1/voices failed (${response.status}): ${body.slice(0, 240)}`,
    );
  }
  const data = await response.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  return voices
    .map((v) => ({
      voiceId: String(v.voice_id || v.voiceId || '').trim(),
      name: String(v.name || '').trim(),
      category: String(v.category || '').trim(),
    }))
    .filter((v) => v.voiceId);
}

async function main() {
  const apiKey = String(env.elevenLabs?.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY missing. Add it to zovi-backend/.env then re-run.',
    );
  }

  const voices = await fetchElevenVoices(apiKey);
  if (!voices.length) {
    throw new Error('ElevenLabs returned zero voices for this API key.');
  }

  const mocks = await query(
    `SELECT u.id AS userId, up.full_name AS fullName
     FROM users u
     INNER JOIN user_profiles up ON up.user_id = u.id
     WHERE u.status = 'active'
       AND u.firebase_uid LIKE ?
     ORDER BY u.id ASC`,
    [`${MOCK_FIREBASE_PREFIX}%`],
  );

  if (!mocks.length) {
    throw new Error('No mock users found. Run npm run seed:mock-chars first.');
  }

  const shuffledVoices = shuffle(voices);
  logger.info('seed_mock_voices_start', {
    mocks: mocks.length,
    voices: shuffledVoices.length,
  });

  let updated = 0;
  for (let i = 0; i < mocks.length; i += 1) {
    const mock = mocks[i];
    const voice = shuffledVoices[i % shuffledVoices.length];
    await query(
      `UPDATE user_profiles
       SET elevenlabs_voice_id = ?
       WHERE user_id = ?`,
      [voice.voiceId, mock.userId],
    );
    updated += 1;
  }

  const sample = await query(
    `SELECT up.full_name AS name, up.elevenlabs_voice_id AS voiceId
     FROM user_profiles up
     INNER JOIN users u ON u.id = up.user_id
     WHERE u.firebase_uid LIKE ?
       AND up.elevenlabs_voice_id IS NOT NULL
     ORDER BY RAND()
     LIMIT 5`,
    [`${MOCK_FIREBASE_PREFIX}%`],
  );

  logger.info('seed_mock_voices_done', {
    updated,
    uniqueVoices: shuffledVoices.length,
    sample,
  });
}

main()
  .catch((err) => {
    logger.error('seed_mock_voices_failed', {
      error: err?.message || String(err),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
