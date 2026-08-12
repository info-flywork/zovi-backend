'use strict';

const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth');
const { MapPresenceRepository } = require('../services/MapPresenceRepository');
const {
  mapNearbyCache,
  mapNearbyKey,
  invalidateMapNearby,
  placesNearbyCache,
  placesNearbyKey,
} = require('../cache/appCache');
const { GooglePlacesService } = require('../services/GooglePlacesService');
const { logger } = require('../utils/logger');

const router = express.Router();
const presence = new MapPresenceRepository();
const places = new GooglePlacesService();

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

    // Presence changed — drop nearby snapshots (6s TTL still bounds staleness).
    invalidateMapNearby();

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
    const cacheFilter =
      filter === 'anon' || filter === 'nearby' ? 'anon' : 'friends';
    const key = mapNearbyKey({
      viewerId: req.user.id,
      filter: cacheFilter,
      lat,
      lng,
      radiusKm,
      limit,
    });

    const items = await mapNearbyCache.getOrSet(key, async () => {
      if (cacheFilter === 'anon') {
        return presence.listAnonNearby(req.user.id, {
          lat,
          lng,
          radiusMeters,
          limit,
        });
      }
      return presence.listFriendsNearby(req.user.id, {
        lat,
        lng,
        radiusMeters,
        limit,
      });
    });

    return res.json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /map/places/nearby?lat=&lng=&radiusMeters=3000&limit=40
 * Google Places Nearby Search (New) — plan / check-in venue picker.
 */
router.get('/places/nearby', requireFirebaseAuth, async (req, res, next) => {
  try {
    const lat = parseCoord(req.query.lat);
    const lng = parseCoord(req.query.lng);
    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COORDS', message: 'lat and lng are required' },
      });
    }

    const radiusMeters = Math.min(
      Math.max(Number(req.query.radiusMeters) || 3000, 100),
      50000,
    );
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 40);
    const key = placesNearbyKey({ lat, lng, radiusMeters, limit });
    const cacheHit = placesNearbyCache.get(key) !== undefined;

    const items = await placesNearbyCache.getOrSet(key, async () =>
      places.searchNearby({ lat, lng, radiusMeters, limit }),
    );
    logger.info('places_nearby_ok', {
      userId: req.user?.id || null,
      lat,
      lng,
      radiusMeters,
      limit,
      count: items.length,
      cacheHit,
    });

    return res.json({ success: true, data: { items } });
  } catch (err) {
    logger.warn('places_nearby_failed', {
      userId: req.user?.id || null,
      lat: req.query?.lat ?? null,
      lng: req.query?.lng ?? null,
      radiusMeters: req.query?.radiusMeters ?? null,
      limit: req.query?.limit ?? null,
      message: err?.message,
      code: err?.code,
      status: err?.status || err?.statusCode || err?.response?.status || null,
    });
    return next(err);
  }
});

module.exports = router;
