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
const {
  GooglePlacesService,
  fetchPlacePhoto,
  isValidPlacesPhotoName,
} = require('../services/GooglePlacesService');
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
      20000,
    );
    const radiusMeters = radiusKm * 1000;
    const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 250);
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
 * GET /map/places/photo?name=places/.../photos/...&maxHeightPx=320
 * Proxies Google Places photo media with the server API key so mobile clients
 * never hit an IP-restricted key (fixes "API KEY required" on map thumbs).
 * Unauthenticated on purpose — Image.network cannot send Bearer tokens.
 * Path shape is strictly validated.
 */
router.get('/places/photo', async (req, res, next) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!isValidPlacesPhotoName(name)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PHOTO_NAME',
          message: 'name must be places/{id}/photos/{id}',
        },
      });
    }

    const maxHeightPx = Math.min(
      Math.max(Number(req.query.maxHeightPx) || 320, 1),
      1600,
    );

    const { buffer, contentType } = await fetchPlacePhoto(name, {
      maxHeightPx,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (err) {
    logger.warn('places_photo_proxy_failed', {
      name: req.query?.name ?? null,
      message: err?.message,
      code: err?.code,
      status: err?.status || err?.response?.status || null,
    });
    if (err?.status === 400 || err?.code === 'INVALID_PHOTO_NAME') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PHOTO_NAME', message: err.message },
      });
    }
    if (err?.code === 'PLACES_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        error: { code: 'PLACES_NOT_CONFIGURED', message: err.message },
      });
    }
    const upstream = err?.response?.status;
    if (upstream === 403 || upstream === 401) {
      return res.status(502).json({
        success: false,
        error: {
          code: 'PLACES_PHOTO_FORBIDDEN',
          message: 'Places photo upstream rejected the server API key',
        },
      });
    }
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
    const cached = placesNearbyCache.get(key);
    // Empty arrays from a failed Places call must not stick for the 15m TTL.
    if (Array.isArray(cached) && cached.length === 0) {
      placesNearbyCache.delete(key);
    }

    const cacheHit = Array.isArray(cached) && cached.length > 0;
    const items = cacheHit
      ? cached
      : await places.searchNearby({ lat, lng, radiusMeters, limit });
    if (!cacheHit && items.length > 0) {
      placesNearbyCache.set(key, items);
    }
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
