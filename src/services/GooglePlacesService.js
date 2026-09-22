'use strict';

const axios = require('axios');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';

/** Pro field mask — name + coords + types (Nearby Search Pro SKU). */
const FIELD_MASK =
  'places.id,places.displayName,places.location,places.types,places.primaryType,places.photos';

/**
 * Google Nearby Search returns max 20 per request. Two complementary type
 * batches cover plan/check-in venues and usually yield ~30–40 unique places.
 */
const TYPE_BATCHES = [
  [
    'restaurant',
    'cafe',
    'coffee_shop',
    'bakery',
    'bar',
    'night_club',
    'meal_takeaway',
  ],
  [
    'park',
    'gym',
    'museum',
    'art_gallery',
    'tourist_attraction',
    'movie_theater',
    'performing_arts_theater',
    'stadium',
    'sports_complex',
  ],
];

const EXCLUDED_TYPES = [
  'hospital',
  'pharmacy',
  'doctor',
  'dentist',
  'veterinary_care',
  'bank',
  'atm',
  'gas_station',
  'parking',
  'police',
  'fire_station',
  'bus_station',
  'taxi_stand',
];

function categoryFromTypes(primaryType, types) {
  const all = new Set(
    [primaryType, ...(Array.isArray(types) ? types : [])]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase()),
  );

  if (
    all.has('cafe') ||
    all.has('coffee_shop') ||
    all.has('bakery') ||
    all.has('ice_cream_shop')
  ) {
    return 'cafe';
  }
  if (
    all.has('restaurant') ||
    all.has('meal_takeaway') ||
    all.has('meal_delivery') ||
    all.has('food')
  ) {
    return 'restaurant';
  }
  if (
    all.has('bar') ||
    all.has('night_club') ||
    all.has('movie_theater') ||
    all.has('performing_arts_theater') ||
    all.has('concert_hall')
  ) {
    return 'music';
  }
  if (
    all.has('gym') ||
    all.has('fitness_center') ||
    all.has('stadium') ||
    all.has('sports_complex') ||
    all.has('sports_club')
  ) {
    return 'gym';
  }
  if (all.has('park') || all.has('national_park') || all.has('garden')) {
    return 'park';
  }
  return 'culture';
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Places photo resource names look like:
 *   places/ChIJ…/photos/AWnL…
 * Clients must never see GOOGLE_PLACES_API_KEY (IP-restricted server key).
 * Return a same-origin proxy URL instead.
 */
function isValidPlacesPhotoName(photoName) {
  const name = String(photoName || '').trim();
  if (!name || name.includes('..') || name.includes('\\')) return false;
  return /^places\/[^/?#]+\/photos\/[^/?#]+$/.test(name);
}

function extractPlacesPhotoName(photoUrl) {
  const raw = String(photoUrl || '').trim();
  if (!raw) return null;
  if (isValidPlacesPhotoName(raw)) return raw;
  try {
    const u = new URL(raw);
    // New proxy: /map/places/photo?name=places/.../photos/...
    if (u.pathname.endsWith('/map/places/photo')) {
      const name = u.searchParams.get('name');
      return isValidPlacesPhotoName(name) ? name : null;
    }
    // Legacy direct Google media URL (had API key in query).
    const m = u.pathname.match(
      /\/v1\/(places\/[^/]+\/photos\/[^/]+)\/media\/?$/,
    );
    if (m && isValidPlacesPhotoName(m[1])) return m[1];
  } catch (_) {
    // ignore
  }
  return null;
}

function buildPhotoUrl(photoName, { maxHeightPx = 320 } = {}) {
  if (!isValidPlacesPhotoName(photoName)) return null;
  if (!env.googlePlaces?.apiKey) return null;
  const height = Math.min(Math.max(Number(maxHeightPx) || 320, 1), 1600);
  const base = env.publicBaseUrl || 'https://zovi.fly-work.com';
  const qs = new URLSearchParams({
    name: String(photoName).trim(),
    maxHeightPx: String(height),
  });
  return `${base}/map/places/photo?${qs.toString()}`;
}

/** Rewrite legacy Google media URLs (with key) to our proxy. */
function normalizePlacePhotoUrl(photoUrl) {
  const raw = String(photoUrl || '').trim();
  if (!raw) return null;
  if (raw.includes('/map/places/photo?')) return raw;
  const name = extractPlacesPhotoName(raw);
  if (!name) return raw;
  return buildPhotoUrl(name) || raw;
}

function normalizePlaceItem(place) {
  if (!place || typeof place !== 'object') return place;
  return {
    ...place,
    photoUrl: normalizePlacePhotoUrl(place.photoUrl),
  };
}

/**
 * Resolve a Places photo to bytes (or a CDN redirect URL).
 * Uses skipHttpRedirect=true so we never forward Google's "API KEY required"
 * error image as if it were a real photo.
 *
 * @returns {Promise<{ buffer: Buffer, contentType: string } | { redirectUrl: string }>}
 */
async function fetchPlacePhoto(photoName, { maxHeightPx = 320 } = {}) {
  if (!env.googlePlaces?.apiKey) {
    const err = new Error('GOOGLE_PLACES_API_KEY is not configured');
    err.status = 503;
    err.code = 'PLACES_NOT_CONFIGURED';
    throw err;
  }
  if (!isValidPlacesPhotoName(photoName)) {
    const err = new Error('Invalid Places photo name');
    err.status = 400;
    err.code = 'INVALID_PHOTO_NAME';
    throw err;
  }

  const height = Math.min(Math.max(Number(maxHeightPx) || 320, 1), 1600);
  const key = env.googlePlaces.apiKey;
  const name = String(photoName).trim();

  // 1) Ask Places for a short-lived CDN URI (no key needed to fetch the URI).
  const metaUrl =
    `https://places.googleapis.com/v1/${name}/media` +
    `?maxHeightPx=${height}&skipHttpRedirect=true` +
    `&key=${encodeURIComponent(key)}`;

  let meta;
  try {
    meta = await axios.get(metaUrl, {
      timeout: 12_000,
      headers: {
        'X-Goog-Api-Key': key,
        Accept: 'application/json',
      },
      validateStatus: (s) => s >= 200 && s < 300,
    });
  } catch (err) {
    const upstream = err?.response?.data;
    const detail =
      typeof upstream === 'object'
        ? upstream?.error?.message || JSON.stringify(upstream).slice(0, 300)
        : String(upstream || err.message || '').slice(0, 300);
    logger.warn('places_photo_meta_failed', {
      name,
      status: err?.response?.status || null,
      detail,
    });
    const wrapped = new Error(
      detail || 'Places photo media metadata request failed',
    );
    wrapped.status = 502;
    wrapped.code = 'PLACES_PHOTO_UPSTREAM';
    wrapped.response = err?.response;
    throw wrapped;
  }

  const photoUri =
    typeof meta.data?.photoUri === 'string' ? meta.data.photoUri.trim() : '';
  if (!photoUri.startsWith('http')) {
    const err = new Error('Places photo media did not return photoUri');
    err.status = 502;
    err.code = 'PLACES_PHOTO_NO_URI';
    throw err;
  }

  // Prefer redirect: Flutter Image.network follows it, and the CDN URL does not
  // need our Places API key (avoids leaking key + IP-restriction issues).
  return { redirectUrl: photoUri };
}

class GooglePlacesService {
  get isConfigured() {
    return Boolean(env.googlePlaces?.apiKey);
  }

  /**
   * @param {{ lat: number, lng: number, radiusMeters?: number, limit?: number }} opts
   * @returns {Promise<Array<{
   *   placeId: string,
   *   placeName: string,
   *   categoryKey: string,
   *   lat: number,
   *   lng: number,
   *   distanceMeters: number,
   *   primaryType: string | null,
   * }>>}
   */
  async searchNearby({ lat, lng, radiusMeters = 3000, limit = 40 }) {
    if (!this.isConfigured) {
      const err = new Error('GOOGLE_PLACES_API_KEY is not configured');
      err.status = 503;
      err.code = 'PLACES_NOT_CONFIGURED';
      throw err;
    }

    const safeRadius = Math.min(Math.max(Number(radiusMeters) || 3000, 100), 50000);
    const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 40);

    let failedBatches = 0;
    const batches = await Promise.all(
      TYPE_BATCHES.map((includedTypes) =>
        this._searchBatch({
          lat,
          lng,
          radiusMeters: safeRadius,
          includedTypes,
          maxResultCount: 20,
        }).catch((err) => {
          failedBatches += 1;
          logger.warn('google_places_batch_failed', {
            message: err?.message,
            status: err?.response?.status,
            code: err?.code,
            includedTypes,
            responseData: err?.response?.data || null,
          });
          return [];
        }),
      ),
    );

    if (failedBatches === TYPE_BATCHES.length) {
      const err = new Error('Google Places upstream failed');
      err.status = 502;
      err.code = 'PLACES_UPSTREAM_FAILED';
      throw err;
    }

    const seen = new Set();
    const merged = [];
    for (const place of batches.flat()) {
      const key = place.placeId || place.placeName.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(place);
    }

    merged.sort((a, b) => a.distanceMeters - b.distanceMeters);
    logger.info('google_places_search_done', {
      lat,
      lng,
      radiusMeters: safeRadius,
      requestedLimit: safeLimit,
      mergedCount: merged.length,
    });
    return merged.slice(0, safeLimit);
  }

  async _searchBatch({ lat, lng, radiusMeters, includedTypes, maxResultCount }) {
    const response = await axios.post(
      PLACES_URL,
      {
        includedTypes,
        excludedTypes: EXCLUDED_TYPES,
        maxResultCount,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
      },
      {
        timeout: 12_000,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.googlePlaces.apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        validateStatus: (s) => s >= 200 && s < 300,
      },
    );

    const places = Array.isArray(response.data?.places)
      ? response.data.places
      : [];
    const out = [];

    for (const place of places) {
      const name = String(place?.displayName?.text || '').trim();
      const placeLat = Number(place?.location?.latitude);
      const placeLng = Number(place?.location?.longitude);
      if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
        continue;
      }

      const primaryType = place.primaryType
        ? String(place.primaryType)
        : null;
      const types = Array.isArray(place.types) ? place.types : [];
      const placeId = place.id ? String(place.id) : '';
      const photos = Array.isArray(place.photos) ? place.photos : [];
      const photoName = photos[0]?.name ? String(photos[0].name) : '';

      out.push({
        placeId,
        placeName: name,
        categoryKey: categoryFromTypes(primaryType, types),
        lat: placeLat,
        lng: placeLng,
        distanceMeters: haversineMeters(lat, lng, placeLat, placeLng),
        primaryType,
        photoUrl: buildPhotoUrl(photoName),
      });
    }

    return out;
  }
}

module.exports = {
  GooglePlacesService,
  buildPhotoUrl,
  fetchPlacePhoto,
  isValidPlacesPhotoName,
  normalizePlacePhotoUrl,
  normalizePlaceItem,
  extractPlacesPhotoName,
};
