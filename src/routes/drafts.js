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
 * multipart: image
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

      const draftId = randomUUID();
      const ext = extFromMime(req.file.mimetype);
      const storageKey = `drafts/${req.user.id}/${draftId}.${ext}`;
      const uploaded = await bunny.uploadBuffer(
        req.file.buffer,
        storageKey,
        req.file.mimetype || 'image/png',
      );

      const draft = await drafts.create({
        id: draftId,
        userId: req.user.id,
        mediaUrl: uploaded.url,
        storageKey: uploaded.storageKey,
        mediaType: 'image',
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
