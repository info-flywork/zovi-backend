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

function buildPhotoUrl(photoName) {
  const name = String(photoName || '').trim();
  if (!name) return null;
  const key = env.googlePlaces?.apiKey || '';
  if (!key) return null;
  return `https://places.googleapis.com/v1/${name}/media?maxHeightPx=320&key=${encodeURIComponent(key)}`;
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

module.exports = { GooglePlacesService };
