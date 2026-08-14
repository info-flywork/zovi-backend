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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
      const err = new Error('Only image or video uploads are allowed');
      err.code = 'INVALID_FILE_TYPE';
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

function extFromMime(mime, originalname = '') {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/png') return 'png';
  if (m === 'video/quicktime') return 'mov';
  if (m === 'video/webm') return 'webm';
  if (m.startsWith('video/')) return 'mp4';
  const name = String(originalname || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  return 'png';
}

function mediaTypeFromUpload(file, hinted) {
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  const name = String(file?.originalname || '').toLowerCase();
  if (/\.(mp4|mov|m4v|webm|avi|mkv)$/.test(name)) return 'video';
  if (String(hinted || '').toLowerCase() === 'video') return 'video';
  return 'image';
}

/**
 * GET /pulses/me
 */
router.get('/me', requireFirebaseAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 60;
    const offset = Number(req.query.offset) || 0;
    const items = await pulses.listForUser(req.user.id, {
      limit,
      offset,
      viewerUserId: req.user.id,
    });
    return res.json({ success: true, data: { pulses: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /pulses/explore
 * Public discovery grid: all active public pulses except the viewer's own.
 */
router.get('/explore', requireFirebaseAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 120;
    const items = await pulses.listPublicExplore(req.user.id, { limit });
    return res.json({ success: true, data: { pulses: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /pulses/:id/like
 */
router.post('/:id/like', requireFirebaseAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const existing = await pulses.findById(id, { viewerUserId: req.user.id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pulse not found' },
      });
    }
    const { pulse } = await pulses.like(id, req.user.id);
    return res.json({
      success: true,
      data: { pulse: pulse || existing },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /pulses/:id/like
 */
router.delete('/:id/like', requireFirebaseAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const existing = await pulses.findById(id, { viewerUserId: req.user.id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pulse not found' },
      });
    }
    const updated = await pulses.unlike(id, req.user.id);
    return res.json({
      success: true,
      data: { pulse: updated || existing },
    });
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

      const mediaType = mediaTypeFromUpload(req.file, req.body.mediaType);
      const pulseId = randomUUID();
      const ext = extFromMime(req.file.mimetype, req.file.originalname);
      const storageKey = `pulses/${req.user.id}/${pulseId}.${ext}`;
      const uploaded = await bunny.uploadBuffer(
        req.file.buffer,
        storageKey,
        req.file.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/png'),
      );

      const pulse = await pulses.create({
        userId: req.user.id,
        mediaUrl: uploaded.url,
        storageKey: uploaded.storageKey,
        mediaType,
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
