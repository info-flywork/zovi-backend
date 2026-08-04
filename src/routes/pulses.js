'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireFirebaseAuth } = require('../middleware/auth');
const { BunnyStorageService } = require('../services/BunnyStorageService');
const { PulseRepository } = require('../services/PulseRepository');
const { logger } = require('../utils/logger');

const router = express.Router();
const bunny = new BunnyStorageService();
const pulses = new PulseRepository();

const pulseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      const err = new Error('Only image uploads are allowed');
      err.code = 'INVALID_FILE_TYPE';
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

function extFromMime(mime) {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

/**
 * GET /pulses/me
 */
router.get('/me', requireFirebaseAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 60;
    const offset = Number(req.query.offset) || 0;
    const items = await pulses.listForUser(req.user.id, { limit, offset });
    return res.json({ success: true, data: { pulses: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /pulses
 * multipart: image + optional audience, placeName, lat, lng, caption, sourceType
 */
router.post(
  '/',
  requireFirebaseAuth,
  pulseUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'image file is required' },
        });
      }

      const audienceRaw = String(req.body.audience || 'public').trim();
      const audience =
        audienceRaw === 'friends_only' ? 'friends_only' : 'public';
      const sourceType =
        String(req.body.sourceType || 'direct').trim() || 'direct';
      const placeName = String(req.body.placeName || '').trim() || null;
      const caption = String(req.body.caption || '').trim() || null;
      const lat = req.body.lat != null && req.body.lat !== ''
        ? Number(req.body.lat)
        : null;
      const lng = req.body.lng != null && req.body.lng !== ''
        ? Number(req.body.lng)
        : null;

      const pulseId = randomUUID();
      const ext = extFromMime(req.file.mimetype);
      const storageKey = `pulses/${req.user.id}/${pulseId}.${ext}`;
      const uploaded = await bunny.uploadBuffer(
        req.file.buffer,
        storageKey,
        req.file.mimetype || 'image/png',
      );

      const pulse = await pulses.create({
        userId: req.user.id,
        mediaUrl: uploaded.url,
        storageKey: uploaded.storageKey,
        mediaType: 'image',
        sourceType,
        // Unique per upload so check_in / direct batches don't collide.
        sourceId: pulseId,
        audience,
        placeName,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        caption,
      });

      logger.info('pulse_created', {
        userId: req.user.id,
        pulseId: pulse?.id,
        sourceType,
      });

      return res.status(201).json({ success: true, data: { pulse } });
    } catch (err) {
      return next(err);
    }
  },
);

module.exports = router;
