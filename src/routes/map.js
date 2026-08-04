'use strict';

const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth');
const { MapPresenceRepository } = require('../services/MapPresenceRepository');

const router = express.Router();
const presence = new MapPresenceRepository();

function parseCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * PUT /map/presence
 * Body: { lat, lng, accuracyM?, locationLabel?, isAnonymous? }
 */
router.put('/presence', requireFirebaseAuth, async (req, res, next) => {
  try {
    const lat = parseCoord(req.body?.lat);
    const lng = parseCoord(req.body?.lng);
    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COORDS', message: 'lat and lng are required' },
      });
    }

    const accuracyM =
      req.body?.accuracyM == null ? null : Number(req.body.accuracyM);
    const locationLabel =
      typeof req.body?.locationLabel === 'string'
        ? req.body.locationLabel
        : null;
    const isAnonymous = Boolean(req.body?.isAnonymous);

    await presence.upsert({
      userId: req.user.id,
      lat,
      lng,
      accuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
      locationLabel,
      isAnonymous,
    });

    return res.json({ success: true, data: { ok: true } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /map/nearby?lat=&lng=&filter=friends|anon&radiusKm=50
 */
router.get('/nearby', requireFirebaseAuth, async (req, res, next) => {
  try {
    const lat = parseCoord(req.query.lat);
    const lng = parseCoord(req.query.lng);
    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COORDS', message: 'lat and lng are required' },
      });
    }

    const filter = String(req.query.filter || 'friends').toLowerCase();
    const radiusKm = Math.min(
      Math.max(Number(req.query.radiusKm) || 50, 1),
      200,
    );
    const radiusMeters = radiusKm * 1000;
    const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 120);

    if (filter === 'anon' || filter === 'nearby') {
      const items = await presence.listAnonNearby(req.user.id, {
        lat,
        lng,
        radiusMeters,
        limit,
      });
      return res.json({ success: true, data: { items } });
    }

    const items = await presence.listFriendsNearby(req.user.id, {
      lat,
      lng,
      radiusMeters,
      limit,
    });
    return res.json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
