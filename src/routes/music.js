'use strict';

const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth');
const { MusicTrackRepository } = require('../services/MusicTrackRepository');
const { SunoMusicService } = require('../services/SunoMusicService');
const { MusicCatalogService } = require('../services/MusicCatalogService');
const { logger } = require('../utils/logger');

const router = express.Router();
const tracks = new MusicTrackRepository();
const suno = new SunoMusicService();
const catalog = new MusicCatalogService({ tracks, suno });

/**
 * GET /music/tracks?q=&limit=&offset=
 * Auth required. Serves DB catalog; lazily expands via Suno when scrolled to end.
 */
router.get('/tracks', requireFirebaseAuth, async (req, res, next) => {
  try {
    const page = await catalog.listPage({
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({
      success: true,
      data: {
        tracks: page.tracks.map((track) => track.toJSON()),
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
        expanding: Boolean(page.expanding),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /music/suno/callback
 * Optional webhook target for Suno (catalog primarily uses polling).
 */
router.post('/suno/callback', async (req, res) => {
  try {
    const payload = req.body || {};
    logger.info('suno_callback_received', {
      callbackType: payload?.data?.callbackType || payload?.callbackType,
      taskId: payload?.data?.task_id || payload?.data?.taskId,
      code: payload?.code,
    });

    const sunoData =
      payload?.data?.data ||
      payload?.data?.sunoData ||
      payload?.data ||
      [];
    const mapped = suno.mapSunoData(Array.isArray(sunoData) ? sunoData : []);
    if (mapped.length > 0) {
      const result = await tracks.insertFromSuno(mapped);
      logger.info('suno_callback_upsert', result);
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error('suno_callback_error', err);
    return res.status(200).json({ success: false });
  }
});

module.exports = router;
