'use strict';

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const RETRY_DELAYS_MS = [400, 1200];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BunnyStorageService {
  get isConfigured() {
    return Boolean(
      env.bunny.storageZone &&
        env.bunny.storageApiKey &&
        env.bunny.cdnHost,
    );
  }

  /**
   * @param {Buffer} buffer
   * @param {string} remotePath e.g. avatars/userId/file.jpg
   * @param {string} [contentType]
   * @returns {Promise<{ storageKey: string, url: string }>}
   */
  async uploadBuffer(buffer, remotePath, contentType = 'application/octet-stream') {
    if (!this.isConfigured) {
      const err = new Error('Bunny Storage is not configured');
      err.code = 'BUNNY_NOT_CONFIGURED';
      throw err;
    }

    const key = remotePath.replace(/^\/+/, '');
    const url = `https://${env.bunny.storageHost}/${env.bunny.storageZone}/${key}`;

    let response;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        response = await axios.put(url, buffer, {
          headers: {
            AccessKey: env.bunny.storageApiKey,
            'Content-Type': contentType,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
        });
      } catch (err) {
        // Network-level failure (timeout, ECONNRESET, ...) — retryable.
        if (attempt === RETRY_DELAYS_MS.length) {
          logger.error('bunny_upload_network_failed', { key, message: err.message });
          const wrapped = new Error('Failed to upload file to Bunny Storage');
          wrapped.code = 'BUNNY_UPLOAD_FAILED';
          wrapped.status = 502;
          throw wrapped;
        }
        logger.warn('bunny_upload_retry', { key, attempt: attempt + 1, message: err.message });
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      if (response.status === 201 || response.status === 200) break;

      const retryable = response.status >= 500;
      if (!retryable || attempt === RETRY_DELAYS_MS.length) {
        logger.error('bunny_upload_failed', {
          status: response.status,
          key,
          data: response.data,
        });
        const err = new Error('Failed to upload file to Bunny Storage');
        err.code = 'BUNNY_UPLOAD_FAILED';
        err.status = 502;
        throw err;
      }
      logger.warn('bunny_upload_retry', { key, attempt: attempt + 1, status: response.status });
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    const publicUrl = `https://${env.bunny.cdnHost}/${key}`;
    logger.info('bunny_upload_ok', { key, publicUrl });
    return { storageKey: key, url: publicUrl };
  }

  async deleteObject(storageKey) {
    if (!this.isConfigured || !storageKey) return;
    const key = String(storageKey).replace(/^\/+/, '');
    const url = `https://${env.bunny.storageHost}/${env.bunny.storageZone}/${key}`;
    try {
      await axios.delete(url, {
        headers: { AccessKey: env.bunny.storageApiKey },
        validateStatus: (s) => s === 200 || s === 404,
      });
    } catch (err) {
      logger.warn('bunny_delete_failed', { key, message: err.message });
    }
  }
}

module.exports = { BunnyStorageService };
