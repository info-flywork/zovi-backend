'use strict';

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const FAIL_STATUSES = new Set([
  'CREATE_TASK_FAILED',
  'GENERATE_AUDIO_FAILED',
  'CALLBACK_EXCEPTION',
  'SENSITIVE_WORD_ERROR',
]);

class SunoMusicService {
  constructor() {
    this.apiKey = env.suno.apiKey;
    this.baseUrl = env.suno.baseUrl.replace(/\/$/, '');
    this.callbackUrl = env.suno.callbackUrl;
  }

  assertConfigured() {
    if (!this.apiKey) {
      throw new Error('Missing SUNO_API_KEY in .env');
    }
  }

  headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * @param {{ prompt: string, instrumental?: boolean, model?: string }} opts
   * @returns {Promise<string>} taskId
   */
  async generate({
    prompt,
    instrumental = false,
    model = 'V4_5ALL',
  } = {}) {
    this.assertConfigured();
    const trimmed = String(prompt || '').trim();
    if (!trimmed) {
      throw new Error('Suno generate requires prompt');
    }

    const body = {
      prompt: trimmed.slice(0, 500),
      customMode: false,
      instrumental: Boolean(instrumental),
      model,
      callBackUrl: this.callbackUrl,
    };

    const url = `${this.baseUrl}/api/v1/generate`;
    const { data } = await axios.post(url, body, {
      headers: this.headers(),
      timeout: 30_000,
    });

    if (data?.code !== 200) {
      throw new Error(
        `Suno generate failed: code=${data?.code} msg=${data?.msg || 'unknown'}`,
      );
    }

    const taskId = data?.data?.taskId;
    if (!taskId) {
      throw new Error('Suno generate response missing taskId');
    }

    logger.info('suno_generate_ok', { taskId, prompt: trimmed.slice(0, 80) });
    return taskId;
  }

  /**
   * @param {string} taskId
   * @returns {Promise<object>}
   */
  async getRecordInfo(taskId) {
    this.assertConfigured();
    const url = `${this.baseUrl}/api/v1/generate/record-info`;
    const { data } = await axios.get(url, {
      headers: this.headers(),
      params: { taskId },
      timeout: 30_000,
    });

    if (data?.code !== 200) {
      throw new Error(
        `Suno record-info failed: code=${data?.code} msg=${data?.msg || 'unknown'}`,
      );
    }

    return data.data;
  }

  /**
   * Poll until SUCCESS (or timeout / failure).
   * @param {string} taskId
   * @param {{ intervalMs?: number, timeoutMs?: number }} [opts]
   * @returns {Promise<Array<{ id: string, title: string, artist: string, genre: string, durationMs: number, coverUrl: string, audioUrl: string, slug: string }>>}
   */
  async waitForTask(taskId, { intervalMs = 8_000, timeoutMs = 240_000 } = {}) {
    const started = Date.now();
    let lastStatus = 'PENDING';

    while (Date.now() - started < timeoutMs) {
      const info = await this.getRecordInfo(taskId);
      lastStatus = info?.status || lastStatus;

      if (FAIL_STATUSES.has(lastStatus)) {
        throw new Error(
          `Suno task failed: status=${lastStatus} error=${info?.errorMessage || info?.errorCode || ''}`,
        );
      }

      if (lastStatus === 'SUCCESS') {
        const sunoData =
          info?.response?.sunoData ||
          info?.response?.data ||
          [];
        const mapped = this.mapSunoData(sunoData);
        if (mapped.length === 0) {
          throw new Error('Suno task SUCCESS but no playable tracks');
        }
        logger.info('suno_task_success', {
          taskId,
          tracks: mapped.length,
          elapsedMs: Date.now() - started,
        });
        return mapped;
      }

      logger.debug('suno_task_poll', { taskId, status: lastStatus });
      await sleep(intervalMs);
    }

    throw new Error(
      `Suno task timeout after ${timeoutMs}ms (lastStatus=${lastStatus})`,
    );
  }

  /**
   * Generate + wait + map in one call.
   * @param {{ prompt: string, instrumental?: boolean, model?: string }} opts
   */
  async generateAndWait(opts) {
    const taskId = await this.generate(opts);
    return this.waitForTask(taskId);
  }

  /**
   * @param {unknown[]} sunoData
   */
  mapSunoData(sunoData) {
    if (!Array.isArray(sunoData)) return [];
    const out = [];

    for (const item of sunoData) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id || '').trim();
      const audioUrl = String(
        item.audioUrl || item.audio_url || item.sourceAudioUrl || '',
      ).trim();
      if (!id || !audioUrl) continue;

      const title =
        String(item.title || '').trim() || `Suno Track ${id.slice(0, 8)}`;
      const tags = String(item.tags || '').trim();
      const genre = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      const durationSec = Number(item.duration) || 0;
      const durationMs = Math.max(0, Math.round(durationSec * 1000));
      const coverUrl = String(
        item.imageUrl || item.image_url || item.sourceImageUrl || '',
      ).trim();

      out.push({
        id,
        slug: `suno-${id}`.slice(0, 64),
        title: title.slice(0, 200),
        artist: 'Suno AI',
        genre: genre.slice(0, 80),
        durationMs: durationMs || 180_000,
        coverUrl,
        audioUrl,
      });
    }

    return out;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { SunoMusicService };
