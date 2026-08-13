'use strict';

const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth');
const { TribeRepository } = require('../services/TribeRepository');

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
    });
    return res.json({ success: true, data });
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

module.exports = router;
