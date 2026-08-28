'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireFirebaseAuth } = require('../middleware/auth');
const { ChatService } = require('../services/ChatService');
const { BunnyStorageService } = require('../services/BunnyStorageService');
const imageProcessor = require('../services/ImageProcessor');
const { logger } = require('../utils/logger');

const router = express.Router();
const chatService = new ChatService();
const bunny = new BunnyStorageService();

const chatMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '');
    if (mime.startsWith('image/') || mime.startsWith('audio/')) {
      return cb(null, true);
    }
    const err = new Error('Only image or audio uploads are allowed');
    err.code = 'INVALID_FILE_TYPE';
    err.status = 400;
    return cb(err);
  },
});

function extFromMime(mime, originalName = '') {
  const lower = String(mime || '').toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'jpg';
  if (lower === 'image/webp') return 'webp';
  if (lower === 'image/gif') return 'gif';
  if (lower === 'image/png') return 'png';
  if (lower === 'audio/mp4' || lower === 'audio/m4a' || lower === 'audio/x-m4a') {
    return 'm4a';
  }
  if (lower === 'audio/mpeg' || lower === 'audio/mp3') return 'mp3';
  if (lower === 'audio/wav' || lower === 'audio/x-wav') return 'wav';
  if (lower === 'audio/ogg' || lower === 'audio/opus') return 'ogg';
  if (lower === 'audio/aac') return 'aac';
  const fromName = String(originalName || '').split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return lower.startsWith('audio/') ? 'm4a' : 'bin';
}

function mediaTypeFromMime(mime) {
  return String(mime || '').startsWith('audio/') ? 'voice' : 'image';
}

function handleServiceError(err, res, next) {
  if (err && err.status) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code || 'CHAT_ERROR', message: err.message },
    });
  }
  return next(err);
}

/**
 * POST /chat/media
 * multipart: file (image/* or audio/*)
 * Returns a CDN mediaUrl for chat messages.
 */
router.post(
  '/media',
  requireFirebaseAuth,
  chatMediaUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'file is required' },
        });
      }

      const mediaType = mediaTypeFromMime(req.file.mimetype);
      let uploadBuffer = req.file.buffer;
      let uploadMime = req.file.mimetype;
      if (mediaType === 'image') {
        const processed = await imageProcessor.resizeAndCompress(uploadBuffer, uploadMime);
        uploadBuffer = processed.buffer;
        uploadMime = processed.mimetype;
      }
      const ext = extFromMime(uploadMime, req.file.originalname);
      const fileId = randomUUID();
      const storageKey = `chat/${req.user.id}/${fileId}.${ext}`;
      const uploaded = await bunny.uploadBuffer(
        uploadBuffer,
        storageKey,
        uploadMime || 'application/octet-stream',
      );

      logger.info('chat_media_uploaded', {
        userId: req.user.id,
        mediaType,
        storageKey: uploaded.storageKey,
      });

      return res.status(201).json({
        success: true,
        data: {
          mediaUrl: uploaded.url,
          storageKey: uploaded.storageKey,
          mediaType,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /chat/conversations?folder=inbox|request
 */
router.get('/conversations', requireFirebaseAuth, async (req, res, next) => {
  try {
    const folder = String(req.query.folder || 'inbox').trim();
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const conversations = await chatService.listConversations(req.user.id, {
      folder,
      limit,
      offset,
    });
    return res.json({ success: true, data: { conversations } });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
});

/**
 * POST /chat/conversations  { peerUserId }
 * Get-or-create a 1:1 DM.
 */
router.post('/conversations', requireFirebaseAuth, async (req, res, next) => {
  try {
    const peerUserId = String(req.body?.peerUserId || '').trim();
    const conversation = await chatService.openDm(req.user.id, peerUserId);
    return res.json({ success: true, data: { conversation } });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
});

/**
 * GET /chat/unread-count
 */
router.get('/unread-count', requireFirebaseAuth, async (req, res, next) => {
  try {
    const data = await chatService.unreadCount(req.user.id);
    return res.json({ success: true, data });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
});

/**
 * DELETE /chat/requests — soft-delete every request folder thread for me
 */
router.delete('/requests', requireFirebaseAuth, async (req, res, next) => {
  try {
    const data = await chatService.deleteAllRequests(req.user.id);
    logger.info('chat_requests_cleared', {
      userId: req.user.id,
      deleted: data.deleted,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
});

/**
 * GET /chat/conversations/:id/messages
 * Optional: ?after=<iso> for incremental poll (only newer messages).
 */
router.get(
  '/conversations/:id/messages',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const before = req.query.before ? String(req.query.before) : null;
      const after = req.query.after ? String(req.query.after) : null;
      const limit = Number(req.query.limit) || 50;
      const messages = await chatService.listMessages(
        req.user.id,
        req.params.id,
        { limit, before, after },
      );
      return res.json({ success: true, data: { messages } });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * GET /chat/conversations/:id/media — gallery images/stamps for a thread
 */
router.get(
  '/conversations/:id/media',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;
      const media = await chatService.listMedia(
        req.user.id,
        req.params.id,
        { limit, offset },
      );
      return res.json({ success: true, data: { media } });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * POST /chat/conversations/:id/accept — move request → inbox for me
 */
router.post(
  '/conversations/:id/accept',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const conversation = await chatService.acceptConversation(
        req.user.id,
        req.params.id,
      );
      return res.json({ success: true, data: { conversation } });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * POST /chat/conversations/:id/block — block peer + hide thread for me
 */
router.post(
  '/conversations/:id/block',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const data = await chatService.blockConversation(
        req.user.id,
        req.params.id,
      );
      return res.json({ success: true, data });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * GET /chat/conversations/:id/typing
 * Who is currently typing (excludes the viewer).
 */
router.get(
  '/conversations/:id/typing',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const data = await chatService.listTyping(req.user.id, req.params.id);
      return res.json({ success: true, data });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * POST /chat/conversations/:id/typing
 * Heartbeat while the viewer is composing.
 */
router.post(
  '/conversations/:id/typing',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const data = await chatService.pulseTyping(req.user.id, req.params.id);
      return res.json({ success: true, data });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * POST /chat/conversations/:id/messages  { type, body, mediaUrl }
 */
router.post(
  '/conversations/:id/messages',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const message = await chatService.sendMessage(
        req.user.id,
        req.params.id,
        {
          type: req.body?.type,
          body: req.body?.body,
          mediaUrl: req.body?.mediaUrl,
          replyToMessageId: req.body?.replyToMessageId,
          replyPreview: req.body?.replyPreview,
        },
      );
      return res.json({ success: true, data: { message } });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * POST /chat/conversations/:id/read
 */
router.post(
  '/conversations/:id/read',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const data = await chatService.markRead(req.user.id, req.params.id);
      return res.json({ success: true, data });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

/**
 * DELETE /chat/conversations/:id — hide thread for me
 */
router.delete(
  '/conversations/:id',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const data = await chatService.deleteConversation(
        req.user.id,
        req.params.id,
      );
      return res.json({ success: true, data });
    } catch (err) {
      return handleServiceError(err, res, next);
    }
  },
);

module.exports = router;
