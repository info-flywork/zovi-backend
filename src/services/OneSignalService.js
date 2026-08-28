'use strict';

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const RETRY_DELAYS_MS = [300, 900];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry only on transient failures — network errors or 5xx, never 4xx. */
function isRetryable(err) {
  const status = err.response?.status;
  return !status || status >= 500;
}

class OneSignalService {
  get enabled() {
    return Boolean(env.oneSignal.appId && env.oneSignal.restApiKey);
  }

  /**
   * Push to OneSignal external_id = our MySQL user UUID.
   * Client must call OneSignal.login(userId) after auth.
   */
  async sendToUser({
    userId,
    heading,
    body,
    data = {},
    collapseId,
  }) {
    if (!this.enabled) {
      logger.warn('onesignal_disabled', { reason: 'missing_credentials' });
      return { skipped: true };
    }
    if (!userId) return { skipped: true };

    try {
      const payload = {
        app_id: env.oneSignal.appId,
        include_aliases: {
          external_id: [String(userId)],
        },
        target_channel: 'push',
        headings: { en: heading, tr: heading },
        contents: { en: body, tr: body },
        data,
        // Deliver to foreground so the app can show in-app banner.
        ios_sound: 'default',
        android_channel_id: undefined,
      };
      const collapse = String(collapseId || '').trim();
      if (collapse) {
        // Replace prior pushes for the same story burst on the device.
        payload.collapse_id = collapse;
        payload.android_group = collapse;
      }

      let response;
      let lastErr;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          response = await axios.post(
            'https://api.onesignal.com/notifications',
            payload,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Key ${env.oneSignal.restApiKey}`,
              },
              timeout: 10000,
            },
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (!isRetryable(err) || attempt === RETRY_DELAYS_MS.length) throw err;
          logger.warn('onesignal_send_retry', {
            userId,
            attempt: attempt + 1,
            status: err.response?.status,
            message: err.message,
          });
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
      if (lastErr) throw lastErr;
      // A 200 with `errors` means nothing was delivered — most often the user
      // has no push subscription yet (OneSignal.login not called, or the
      // device never registered with APNs/FCM).
      const errors = response.data?.errors;
      const recipients = response.data?.recipients;
      if (errors || recipients === 0) {
        logger.warn('onesignal_not_delivered', {
          userId,
          recipients,
          errors,
        });
        return { ok: false, undelivered: true, errors };
      }

      logger.info('onesignal_sent', {
        userId,
        recipients,
        notificationId: response.data?.id,
      });
      return { ok: true, id: response.data?.id };
    } catch (err) {
      logger.error('onesignal_send_failed', {
        userId,
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
      return { ok: false, error: err.message };
    }
  }
}

module.exports = { OneSignalService };
