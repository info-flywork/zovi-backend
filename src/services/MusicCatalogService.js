'use strict';

const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { MUSIC_PROMPTS } = require('./musicPrompts');
const { SunoMusicService } = require('./SunoMusicService');
const { MusicTrackRepository } = require('./MusicTrackRepository');

/**
 * Serves music catalog from DB. When the client scrolls past the end,
 * generates a new Suno batch once, persists to DB, then reads again.
 * Already-saved tracks are never re-fetched from Suno.
 */
class MusicCatalogService {
  constructor({
    tracks = new MusicTrackRepository(),
    suno = new SunoMusicService(),
  } = {}) {
    this.tracks = tracks;
    this.suno = suno;
    this._promptIndex = 0;
    this._expandPromise = null;
    this._consecutiveFailures = 0;
  }

  get canExpand() {
    return Boolean(env.suno.apiKey) && this._consecutiveFailures < 3;
  }

  nextPrompt() {
    const job = MUSIC_PROMPTS[this._promptIndex % MUSIC_PROMPTS.length];
    this._promptIndex += 1;
    return job;
  }

  /**
   * Generate one Suno job (2 tracks), insert into DB. Deduped by in-flight mutex.
   * @returns {Promise<number>} inserted count
   */
  expandOnce() {
    if (!this.canExpand) return Promise.resolve(0);
    if (this._expandPromise) return this._expandPromise;

    this._expandPromise = (async () => {
      const job = this.nextPrompt();
      logger.info('music_catalog_expand_start', {
        prompt: job.prompt.slice(0, 60),
        instrumental: job.instrumental,
      });
      try {
        const mapped = await this.suno.generateAndWait({
          prompt: job.prompt,
          instrumental: job.instrumental,
          model: 'V4_5ALL',
        });
        const result = await this.tracks.insertFromSuno(mapped);
        this._consecutiveFailures = 0;
        logger.info('music_catalog_expand_ok', result);
        return result.inserted;
      } catch (err) {
        this._consecutiveFailures += 1;
        logger.error('music_catalog_expand_failed', {
          message: err.message,
          consecutiveFailures: this._consecutiveFailures,
        });
        return 0;
      } finally {
        this._expandPromise = null;
      }
    })();

    return this._expandPromise;
  }

  /**
   * @param {{ q?: string, limit?: number, offset?: number }} opts
   */
  async listPage(opts = {}) {
    const q = String(opts.q || '').trim();
    let page = await this.tracks.list(opts);

    // Search stays DB-only — never bill Suno for query traffic.
    if (q) return page;

    if (!this.canExpand) return page;

    // Past the end of DB: wait for a new batch, then re-read same offset.
    if (!page.hasMore && page.tracks.length === 0) {
      const inserted = await this.expandOnce();
      if (inserted > 0) {
        page = await this.tracks.list(opts);
      }
      return {
        ...page,
        hasMore: page.hasMore || (inserted > 0 && this.canExpand),
        expanding: false,
      };
    }

    // Last (possibly partial) DB page: prefetch next Suno batch in background
    // so the next scroll already finds rows in DB.
    if (!page.hasMore) {
      void this.expandOnce();
      return {
        ...page,
        hasMore: true,
        expanding: true,
      };
    }

    return { ...page, expanding: false };
  }
}

module.exports = { MusicCatalogService };
