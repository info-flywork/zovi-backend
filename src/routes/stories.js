'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireFirebaseAuth } = require('../middleware/auth');
const { BunnyStorageService } = require('../services/BunnyStorageService');
const { StoryRepository } = require('../services/StoryRepository');
const { UserRepository } = require('../services/UserRepository');
const { PulseRepository } = require('../services/PulseRepository');
const { NotificationService } = require('../services/NotificationService');
const { logger } = require('../utils/logger');
const { invalidateStoryFeeds, storyFeedCache, storyFeedKey } = require('../cache/appCache');

const router = express.Router();
const bunny = new BunnyStorageService();
const stories = new StoryRepository();
const users = new UserRepository();
const pulses = new PulseRepository();
const notifications = new NotificationService();

const storyUpload = multer({
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
 * POST /stories
 * multipart: image + audience + optional music fields
 */
router.post(
  '/',
  requireFirebaseAuth,
  storyUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'image file is required' },
        });
      }

      const audienceRaw = String(req.body.audience || 'friends_only').trim();
      const audience =
        audienceRaw === 'public' ? 'public' : 'friends_only';

      const musicTrackId = String(req.body.musicTrackId || '').trim() || null;
      const musicClipStartMs = req.body.musicClipStartMs
        ? Number(req.body.musicClipStartMs)
        : null;
      const musicClipDurationMs = req.body.musicClipDurationMs
        ? Number(req.body.musicClipDurationMs)
        : null;

      const mediaType = mediaTypeFromUpload(req.file, req.body.mediaType);
      const storyId = randomUUID();
      const ext = extFromMime(req.file.mimetype, req.file.originalname);
      const storageKey = `stories/${req.user.id}/${storyId}.${ext}`;
      const uploaded = await bunny.uploadBuffer(
        req.file.buffer,
        storageKey,
        req.file.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/png'),
      );

      const story = await stories.create({
        userId: req.user.id,
        mediaUrl: uploaded.url,
        storageKey: uploaded.storageKey,
        mediaType,
        audience,
        musicTrackId,
        musicClipStartMs: Number.isFinite(musicClipStartMs)
          ? musicClipStartMs
          : null,
        musicClipDurationMs: Number.isFinite(musicClipDurationMs)
          ? musicClipDurationMs
          : null,
      });

      // Re-fetch with music join (create returns without join fields if find fails timing)
      const full = (await stories.findById(story.id)) || story;

      // Every shared story photo also lands on the profile Pulse grid.
      try {
        await pulses.create({
          userId: req.user.id,
          mediaUrl: uploaded.url,
          storageKey: uploaded.storageKey,
          mediaType,
          sourceType: 'story',
          sourceId: full.id,
          audience,
        });
      } catch (pulseErr) {
        logger.warn('pulse_from_story_failed', {
          userId: req.user.id,
          storyId: full.id,
          message: pulseErr.message,
        });
      }

      logger.info('story_created', {
        userId: req.user.id,
        storyId: full.id,
        audience,
        hasMusic: Boolean(musicTrackId),
      });

      invalidateStoryFeeds();

      return res.status(201).json({
        success: true,
        data: { story: full.toJSON() },
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /stories/feed
 * Home bar summary for current user ("Your story") + active story payloads
 * so the client can open the viewer without a second round-trip.
 */
router.get('/feed', requireFirebaseAuth, async (req, res, next) => {
  try {
    const data = await storyFeedCache.getOrSet(
      storyFeedKey(req.user.id),
      async () => {
        const profile = await users.getProfile(req.user.id);
        const [summary, friends] = await Promise.all([
          stories.getFeedSummaryForUser(req.user.id, req.user.id),
          stories.listFriendFeed(req.user.id),
        ]);
        const list = summary.hasStory
          ? await stories.listActiveByUser(req.user.id, {
              viewerUserId: req.user.id,
            })
          : [];

        return {
          me: {
            userId: req.user.id,
            name: profile?.fullName || 'You',
            avatarUrl: profile?.avatarUrl || '',
            hasStory: summary.hasStory,
            isViewed: summary.isViewed,
            storyCount: summary.storyCount,
          },
          stories: list.map((s) => s.toJSON()),
          friends: friends.map((group) => ({
            userId: group.userId,
            name: group.name,
            username: group.username,
            avatarUrl: group.avatarUrl,
            hasStory: group.hasStory,
            isViewed: group.isViewed,
            storyCount: group.storyCount,
            stories: group.stories.map((s) => s.toJSON()),
          })),
        };
      },
    );

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /stories/explore
 * Public discovery grid: all active public stories except the viewer's own.
 */
router.get('/explore', requireFirebaseAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 120;
    const list = await stories.listPublicExplore(req.user.id, { limit });
    let pulseList = [];
    try {
      pulseList = await pulses.listPublicExplore(req.user.id, { limit });
    } catch (err) {
      logger.warn('explore_pulses_failed', { message: err.message });
    }
    return res.json({
      success: true,
      data: {
        stories: list.map((item) => ({
          ...item.story.toJSON(),
          authorName: item.authorName,
          authorUsername: item.authorUsername,
          authorAvatarUrl: item.authorAvatarUrl,
        })),
        pulses: pulseList,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /stories/me
 * Active stories for the authenticated user.
 */
router.get('/me', requireFirebaseAuth, async (req, res, next) => {
  try {
    const profile = await users.getProfile(req.user.id);
    const list = await stories.listActiveByUser(req.user.id, {
      viewerUserId: req.user.id,
    });
    return res.json({
      success: true,
      data: {
        userId: req.user.id,
        name: profile?.fullName || 'You',
        avatarUrl: profile?.avatarUrl || '',
        stories: list.map((s) => s.toJSON()),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /stories/by-user/:userId
 */
router.get('/by-user/:userId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_USER', message: 'userId required' },
      });
    }

    const profile = await users.getProfile(userId);
    const list = await stories.listActiveByUser(userId, {
      viewerUserId: req.user.id,
    });

    return res.json({
      success: true,
      data: {
        userId,
        name: profile?.fullName || '',
        username: profile?.username || '',
        avatarUrl: profile?.avatarUrl || '',
        stories: list.map((s) => s.toJSON()),
      },
    });
  } catch (err) {
    return next(err);
  }
});

async function loadActiveStoryOrRespond(req, res, id) {
  const existing = await stories.findById(id, {
    viewerUserId: req.user.id,
  });
  if (!existing || existing.deletedAt) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Story not found' },
    });
    return null;
  }

  const expiresAt = new Date(existing.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    res.status(410).json({
      success: false,
      error: { code: 'EXPIRED', message: 'Story expired' },
    });
    return null;
  }

  return existing;
}

/**
 * POST /stories/:id/view
 */
router.post('/:id/view', requireFirebaseAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const existing = await loadActiveStoryOrRespond(req, res, id);
    if (!existing) return undefined;

    const updated = await stories.markViewed(id, req.user.id);
    storyFeedCache.delete(storyFeedKey(req.user.id));
    return res.json({
      success: true,
      data: { story: updated ? updated.toJSON() : existing.toJSON() },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /stories/:id/like
 */
router.post('/:id/like', requireFirebaseAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const existing = await loadActiveStoryOrRespond(req, res, id);
    if (!existing) return undefined;

    const alreadyLiked = Boolean(existing.likedByMe);
    const { story, created } = await stories.like(id, req.user.id);
    const isNewLike = created || (!alreadyLiked && story?.likedByMe);
    const ownerId = String(existing.userId || '').trim();
    const actorId = String(req.user.id || '').trim();

    if (isNewLike && ownerId && ownerId !== actorId) {
      try {
        await notifications.notifyStoryLike({
          recipientId: ownerId,
          actorId,
          storyId: id,
          thumbnailUrl: existing.mediaUrl || '',
        });
        logger.info('story_like_notified', {
          storyId: id,
          ownerId,
          actorId,
        });
      } catch (err) {
        logger.error('story_like_notify_failed', {
          err: err.message,
          stack: err.stack,
          storyId: id,
          ownerId,
          actorId,
        });
      }
    } else {
      logger.info('story_like_skip_notify', {
        storyId: id,
        ownerId,
        actorId,
        created,
        alreadyLiked,
        isNewLike,
      });
    }

    return res.json({
      success: true,
      data: { story: story ? story.toJSON() : existing.toJSON() },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /stories/:id/like
 */
router.delete('/:id/like', requireFirebaseAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const existing = await loadActiveStoryOrRespond(req, res, id);
    if (!existing) return undefined;

    const updated = await stories.unlike(id, req.user.id);
    return res.json({
      success: true,
      data: { story: updated ? updated.toJSON() : existing.toJSON() },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
