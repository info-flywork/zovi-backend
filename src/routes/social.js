'use strict';

const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth');
const { FollowService } = require('../services/FollowService');
const { NotificationService } = require('../services/NotificationService');
const { logger } = require('../utils/logger');
const {
  invalidateUser,
  invalidateStoryFeeds,
  publicProfileCache,
} = require('../cache/appCache');

const router = express.Router();
const followService = new FollowService();
const notificationService = new NotificationService();

/**
 * POST /social/follow/:userId
 */
router.post('/follow/:userId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const targetId = String(req.params.userId || '').trim();
    const result = await followService.follow(req.user.id, targetId);
    logger.info('follow_action', {
      actorId: req.user.id,
      targetId,
      status: result.status,
    });
    invalidateUser(req.user.id);
    invalidateUser(targetId);
    invalidateStoryFeeds();
    publicProfileCache.deletePrefix(`prof:${req.user.id}:`);
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code || 'FOLLOW_FAILED', message: err.message },
      });
    }
    return next(err);
  }
});

/**
 * DELETE /social/follow/:userId
 */
router.delete('/follow/:userId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const targetId = String(req.params.userId || '').trim();
    const result = await followService.unfollow(req.user.id, targetId);
    invalidateUser(req.user.id);
    invalidateUser(targetId);
    invalidateStoryFeeds();
    publicProfileCache.deletePrefix(`prof:${req.user.id}:`);
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /social/follow-requests/:id/accept
 */
router.post(
  '/follow-requests/:id/accept',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const result = await followService.acceptRequest(req.user.id, id);
      invalidateUser(req.user.id);
      invalidateStoryFeeds();
      publicProfileCache.deletePrefix(`prof:${req.user.id}:`);
      return res.json({ success: true, data: result });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code || 'ACCEPT_FAILED', message: err.message },
        });
      }
      return next(err);
    }
  },
);

/**
 * POST /social/follow-requests/:id/reject
 */
router.post(
  '/follow-requests/:id/reject',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      const result = await followService.rejectRequest(req.user.id, id);
      return res.json({ success: true, data: result });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code || 'REJECT_FAILED', message: err.message },
        });
      }
      return next(err);
    }
  },
);

/**
 * GET /social/relationship/:userId
 */
router.get(
  '/relationship/:userId',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const targetId = String(req.params.userId || '').trim();
      const relationship = await followService.getRelationship(
        req.user.id,
        targetId,
      );
      return res.json({ success: true, data: { relationship } });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /social/notifications
 */
router.get('/notifications', requireFirebaseAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const items = await notificationService.listForUser(req.user.id, {
      limit,
      offset,
    });
    return res.json({ success: true, data: { notifications: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /social/notifications/:id/read
 */
router.post(
  '/notifications/:id/read',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      await notificationService.notifications.markRead(req.user.id, id);
      return res.json({ success: true, data: { read: true } });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * POST /social/notifications/read-all
 */
router.post(
  '/notifications/read-all',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      await notificationService.notifications.markAllRead(req.user.id);
      return res.json({ success: true, data: { read: true } });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * DELETE /social/notifications/:id — soft-delete from the recipient's inbox
 */
router.delete(
  '/notifications/:id',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'id required' },
        });
      }
      const deleted = await notificationService.notifications.softDelete(
        req.user.id,
        id,
      );
      return res.json({ success: true, data: { deleted } });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * DELETE /social/followers/:userId — remove someone from my followers
 */
router.delete(
  '/followers/:userId',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const followerId = String(req.params.userId || '').trim();
      const result = await followService.removeFollower(req.user.id, followerId);
      return res.json({ success: true, data: result });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          error: {
            code: err.code || 'REMOVE_FOLLOWER_FAILED',
            message: err.message,
          },
        });
      }
      return next(err);
    }
  },
);

/**
 * GET /social/:userId/followers
 */
router.get(
  '/:userId/followers',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const targetId = String(req.params.userId || '').trim();
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const users = await followService.listFollowers(req.user.id, targetId, {
        limit,
        offset,
      });
      return res.json({ success: true, data: { users } });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code || 'LIST_FAILED', message: err.message },
        });
      }
      return next(err);
    }
  },
);

/**
 * GET /social/:userId/following
 */
router.get(
  '/:userId/following',
  requireFirebaseAuth,
  async (req, res, next) => {
    try {
      const targetId = String(req.params.userId || '').trim();
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const users = await followService.listFollowing(req.user.id, targetId, {
        limit,
        offset,
      });
      return res.json({ success: true, data: { users } });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code || 'LIST_FAILED', message: err.message },
        });
      }
      return next(err);
    }
  },
);

module.exports = router;
