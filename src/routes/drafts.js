'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireFirebaseAuth } = require('../middleware/auth');
const { BunnyStorageService } = require('../services/BunnyStorageService');
const { StoryDraftRepository } = require('../services/StoryDraftRepository');
const { logger } = require('../utils/logger');

const router = express.Router();
const bunny = new BunnyStorageService();
const drafts = new StoryDraftRepository();

const draftUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const isVideo =
      mime.startsWith('video/') ||
      /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(name);
    const isImage = mime.startsWith('image/');
    if (!isImage && !isVideo) {
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
 * GET /drafts
 * List the signed-in user's story drafts (newest first).
 */
router.get('/', requireFirebaseAuth, async (req, res, next) => {
  try {
    const items = await drafts.listByUser(req.user.id);
    return res.json({
      success: true,
      data: {
        drafts: items.map((item) => item.toJSON()),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /drafts
 * multipart: image + optional mediaType=video
 */
router.post(
  '/',
  requireFirebaseAuth,
  draftUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'image file is required' },
        });
      }

      const mediaType = mediaTypeFromUpload(req.file, req.body?.mediaType);
      const draftId = randomUUID();
      const ext = extFromMime(req.file.mimetype, req.file.originalname);
      const storageKey = `drafts/${req.user.id}/${draftId}.${ext}`;
      const uploaded = await bunny.uploadBuffer(
        req.file.buffer,
        storageKey,
        req.file.mimetype ||
          (mediaType === 'video' ? 'video/mp4' : 'image/png'),
      );

      const draft = await drafts.create({
        id: draftId,
        userId: req.user.id,
        mediaUrl: uploaded.url,
        storageKey: uploaded.storageKey,
        mediaType,
      });

      logger.info('story_draft_created', {
        userId: req.user.id,
        draftId: draft.id,
      });

      return res.status(201).json({
        success: true,
        data: { draft: draft.toJSON() },
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * DELETE /drafts/:id
 */
router.delete('/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const existing = await drafts.findById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Draft not found' },
      });
    }

    await drafts.softDelete(id, req.user.id);
    await bunny.deleteObject(existing.storageKey);

    logger.info('story_draft_deleted', {
      userId: req.user.id,
      draftId: id,
    });

    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
