'use strict';

const express = require('express');
const { requireFirebaseAuth, authService } = require('../middleware/auth');
const {
  TribeRepository,
  MANUAL_TRIBE_COIN_COST,
} = require('../services/TribeRepository');

const router = express.Router();
const tribes = new TribeRepository();

/**
 * GET /tribes
 * Algorithmic tribes for the signed-in user, bucketed into
 * { featured, tribes } for the Tribe screen.
 */
router.get('/', requireFirebaseAuth, async (req, res, next) => {
  try {
    const data = await tribes.listForUser(req.user.id, {
      lat: req.query.lat,
      lng: req.query.lng,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /tribes
 * Create a user-owned group (costs coins).
 * Body: { name: string }
 */
router.post('/', requireFirebaseAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'name is required' },
      });
    }

    const balance = await authService.users.getCoinBalance(req.user.id);
    if (balance < MANUAL_TRIBE_COIN_COST) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_COINS',
          message: 'Not enough coins',
        },
      });
    }

    const result = await tribes.createManual(req.user.id, {
      name,
      coinCost: MANUAL_TRIBE_COIN_COST,
    });
    if (!result.ok) {
      const status =
        result.reason === 'insufficient_coins'
          ? 402
          : result.reason === 'invalid_name'
            ? 400
            : 400;
      const code =
        result.reason === 'insufficient_coins'
          ? 'INSUFFICIENT_COINS'
          : result.reason === 'invalid_name'
            ? 'INVALID_NAME'
            : 'CREATE_FAILED';
      return res.status(status).json({
        success: false,
        error: { code, message: result.reason },
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        tribe: result.tribe,
        coinsBalance: result.coinsBalance,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /tribes/:id/photo
 * Body: { photoUrl: string }
 * Only group creator can change photo.
 */
router.post('/:id/photo', requireFirebaseAuth, async (req, res, next) => {
  try {
    const photoUrl = String(req.body?.photoUrl || '').trim();
    if (!photoUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PHOTO', message: 'photoUrl is required' },
      });
    }
    const result = await tribes.updatePhoto(req.user.id, req.params.id, {
      photoUrl,
    });
    if (!result.ok) {
      const status =
        result.reason === 'not_found'
          ? 404
          : result.reason === 'forbidden'
            ? 403
            : 400;
      const code =
        result.reason === 'not_found'
          ? 'NOT_FOUND'
          : result.reason === 'forbidden'
            ? 'FORBIDDEN'
            : 'INVALID_PHOTO';
      return res.status(status).json({
        success: false,
        error: { code, message: result.reason },
      });
    }
    return res.json({ success: true, data: { tribe: result.tribe } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /tribes/:id
 * Tribe detail + real members for group chat / group info.
 */
router.get('/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const result = await tribes.getForUser(req.user.id, req.params.id);
    if (!result.ok) {
      return res.status(404).json({ success: false, error: result.reason });
    }
    return res.json({ success: true, data: { tribe: result.tribe } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /tribes/:id/join
 * Opt-in join. The algorithm places the user; joining is always an explicit
 * user action (chat only opens after this call succeeds).
 */
router.post('/:id/join', requireFirebaseAuth, async (req, res, next) => {
  try {
    const result = await tribes.join(req.user.id, req.params.id);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 403;
      return res.status(status).json({ success: false, error: result.reason });
    }
    return res.json({ success: true, data: { tribe: result.tribe } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /tribes/:id/leave
 * Opt-out. Membership falls back to eligible so the tribe list no longer
 * treats the user as a member.
 */
router.post('/:id/leave', requireFirebaseAuth, async (req, res, next) => {
  try {
    const result = await tribes.leave(req.user.id, req.params.id);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 403;
      return res.status(status).json({ success: false, error: result.reason });
    }
    return res.json({ success: true, data: { tribe: result.tribe } });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /tribes/:id
 * Owner-only delete for user-created groups.
 */
router.delete('/:id', requireFirebaseAuth, async (req, res, next) => {
  try {
    const result = await tribes.deleteByOwner(req.user.id, req.params.id);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 403;
      return res.status(status).json({ success: false, error: result.reason });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
