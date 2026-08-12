'use strict';

const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth');
const { CheckInService } = require('../services/CheckInService');
const {
  friendshipStreaksCache,
  friendshipStreaksKey,
  invalidateMapNearby,
  invalidateUser,
} = require('../cache/appCache');

const router = express.Router();
const checkIns = new CheckInService();

/**
 * GET /check-ins/streaks
 * Pair lifestyle streaks with friends.
 */
router.get('/streaks', requireFirebaseAuth, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const items = await friendshipStreaksCache.getOrSet(
      `${friendshipStreaksKey(req.user.id)}:${limit}`,
      () => checkIns.listFriendshipStreaks(req.user.id, { limit }),
    );
    return res.json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /check-ins/active
 * Current user's active map check-in (survives app restart).
 */
router.get('/active', requireFirebaseAuth, async (req, res, next) => {
  try {
    const active = await checkIns.getActiveOnMap(req.user.id);
    return res.json({ success: true, data: { active } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /check-ins/me
 * Signed-in user's check-in history for the profile tab.
 */
router.get('/me', requireFirebaseAuth, async (req, res, next) => {
  try {
    const items = await checkIns.listForUser(req.user.id, {
      viewerId: req.user.id,
      viewerFollows: true,
      limit: Number(req.query.limit) || 60,
      offset: Number(req.query.offset) || 0,
    });
    return res.json({ success: true, data: { checkIns: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /check-ins/reward-rules
 */
router.get('/reward-rules', requireFirebaseAuth, async (_req, res, next) => {
  try {
    const rules = await checkIns.listRewardRules();
    return res.json({
      success: true,
      data: {
        rules: rules.map((r) => ({
          code: r.code,
          coins: Number(r.coins),
          messageKey: r.message_key,
          iconKey: r.icon_key,
          sortOrder: Number(r.sort_order),
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /check-ins
 * Body: {
 *   placeName, lat, lng, caption?, photoPrivacy?,
 *   taggedUserIds?: string[], photoUrls?: string[], category?
 * }
 */
router.post('/', requireFirebaseAuth, async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const placeName = String(req.body?.placeName || '').trim();
    if (!placeName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CHECK_IN',
          message: 'placeName, lat and lng are required',
        },
      });
    }

    const result = await checkIns.create({
      userId: req.user.id,
      placeName,
      lat,
      lng,
      caption: req.body?.caption,
      photoPrivacy: req.body?.photoPrivacy || req.body?.audience,
      taggedUserIds: Array.isArray(req.body?.taggedUserIds)
        ? req.body.taggedUserIds
        : [],
      photoUrls: Array.isArray(req.body?.photoUrls) ? req.body.photoUrls : [],
      category: req.body?.category,
    });

    invalidateMapNearby();
    invalidateUser(req.user.id);
    friendshipStreaksCache.clear();

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /check-ins/:id/accept-founder
 * Accept founder stamp + equip Kurucu Kral title.
 */
router.post('/:id/accept-founder', requireFirebaseAuth, async (req, res, next) => {
  try {
    const result = await checkIns.acceptFounderReward({
      userId: req.user.id,
      checkInId: req.params.id,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
