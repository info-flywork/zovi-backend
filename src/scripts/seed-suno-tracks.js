'use strict';

/**
 * Seed music_tracks from Suno API.
 *
 * Usage:
 *   npm run seed:suno
 *   npm run seed:suno -- --count=5
 *
 * Requires SUNO_API_KEY in backend/.env
 */

const { env } = require('../config/env');
const { closePool } = require('../config/database');
const { logger } = require('../utils/logger');
const { MUSIC_PROMPTS } = require('../services/musicPrompts');
const { SunoMusicService } = require('../services/SunoMusicService');
const { MusicTrackRepository } = require('../services/MusicTrackRepository');

function parseCount(argv) {
  const flag = argv.find((a) => a.startsWith('--count='));
  if (!flag) return MUSIC_PROMPTS.length;
  const n = Number(flag.split('=')[1]);
  if (!Number.isFinite(n) || n < 1) return MUSIC_PROMPTS.length;
  return Math.min(Math.floor(n), MUSIC_PROMPTS.length);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!env.suno.apiKey) {
    throw new Error(
      'SUNO_API_KEY is missing. Add it to backend/.env (https://sunoapi.org/api-key)',
    );
  }

  const count = parseCount(process.argv.slice(2));
  const jobs = MUSIC_PROMPTS.slice(0, count);
  const suno = new SunoMusicService();
  const repo = new MusicTrackRepository();

  let totalInserted = 0;
  let totalSkipped = 0;
  let failures = 0;

  logger.info('seed_suno_start', {
    jobs: jobs.length,
    callbackUrl: env.suno.callbackUrl,
  });

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    logger.info('seed_suno_job', {
      index: i + 1,
      total: jobs.length,
      prompt: job.prompt.slice(0, 60),
      instrumental: job.instrumental,
    });

    try {
      const mapped = await suno.generateAndWait({
        prompt: job.prompt,
        instrumental: job.instrumental,
        model: 'V4_5ALL',
      });
      const result = await repo.insertFromSuno(mapped);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      logger.info('seed_suno_job_ok', {
        index: i + 1,
        tracks: mapped.length,
        ...result,
      });
    } catch (err) {
      failures += 1;
      logger.error('seed_suno_job_failed', {
        index: i + 1,
        message: err.message,
      });
    }

    if (i < jobs.length - 1) {
      await sleep(2_000);
    }
  }

  logger.info('seed_suno_done', {
    inserted: totalInserted,
    skipped: totalSkipped,
    failures,
  });

  if (totalInserted === 0 && failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error('seed_suno_fatal', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (_) {
      // ignore
    }
  });
