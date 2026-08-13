'use strict';

const { TtlCache } = require('../utils/ttlCache');

/**
 * Named response caches for hot read paths.
 * TTLs stay short so stale social data self-heals quickly even if a
 * write-path invalidation is missed.
 */
const meCache = new TtlCache({
  name: 'auth_me',
  max: 2_000,
  defaultTtlMs: 20_000,
});

const storyFeedCache = new TtlCache({
  name: 'story_feed',
  max: 2_000,
  defaultTtlMs: 12_000,
});

const publicProfileCache = new TtlCache({
  name: 'public_profile',
  max: 3_000,
  defaultTtlMs: 20_000,
});

const mapNearbyCache = new TtlCache({
  name: 'map_nearby',
  max: 3_000,
  defaultTtlMs: 6_000,
});

const stampsCatalogCache = new TtlCache({
  name: 'stamps_catalog',
  max: 32,
  defaultTtlMs: 5 * 60_000,
});

const friendshipStreaksCache = new TtlCache({
  name: 'friendship_streaks',
  max: 2_000,
  defaultTtlMs: 30_000,
});

const placesNearbyCache = new TtlCache({
  name: 'places_nearby',
  max: 2_000,
  defaultTtlMs: 15 * 60_000,
});

/** ~110m grid — reduces cache fragmentation for nearby map queries. */
function roundCoord(value) {
  return Number(Number(value).toFixed(3));
}

function meKey(userId) {
  return `me:${userId}`;
}

function storyFeedKey(userId) {
  return `feed:${userId}`;
}

function publicProfileKey(viewerId, username) {
  return `prof:${viewerId}:${String(username || '').toLowerCase()}`;
}

function mapNearbyKey({ viewerId, filter, lat, lng, radiusKm, limit }) {
  return [
    'map',
    viewerId,
    filter,
    roundCoord(lat),
    roundCoord(lng),
    radiusKm,
    limit,
  ].join(':');
}

function stampsCatalogKey(locale) {
  return `stamps:${locale}`;
}

function friendshipStreaksKey(userId) {
  return `streaks:${userId}`;
}

function placesNearbyKey({ lat, lng, radiusMeters, limit }) {
  return [
    'places',
    roundCoord(lat),
    roundCoord(lng),
    radiusMeters,
    limit,
  ].join(':');
}

/** Drop all cached rows that belong to this user as subject or viewer. */
function invalidateUser(userId) {
  if (!userId) return;
  meCache.delete(meKey(userId));
  storyFeedCache.delete(storyFeedKey(userId));
  friendshipStreaksCache.delete(friendshipStreaksKey(userId));
  publicProfileCache.deletePrefix(`prof:${userId}:`);
  // Profiles of this user as seen by others: prof:{any}:{username} — callers
  // that know the username should also call invalidateUsername.
  mapNearbyCache.deletePrefix(`map:${userId}:`);
}

function invalidateUsername(username) {
  const handle = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!handle) return;
  publicProfileCache.deleteWhere((key) => key.endsWith(`:${handle}`));
}

function invalidateStoryFeeds() {
  // Story publish can affect every follower's feed — short TTL + clear all.
  storyFeedCache.clear();
}

function invalidateMapNearby() {
  mapNearbyCache.clear();
}

function invalidatePlacesNearby() {
  placesNearbyCache.clear();
}

function invalidateStampsCatalog() {
  stampsCatalogCache.clear();
}

module.exports = {
  meCache,
  storyFeedCache,
  publicProfileCache,
  mapNearbyCache,
  stampsCatalogCache,
  friendshipStreaksCache,
  placesNearbyCache,
  meKey,
  storyFeedKey,
  publicProfileKey,
  mapNearbyKey,
  stampsCatalogKey,
  friendshipStreaksKey,
  placesNearbyKey,
  roundCoord,
  invalidateUser,
  invalidateUsername,
  invalidateStoryFeeds,
  invalidateMapNearby,
  invalidatePlacesNearby,
  invalidateStampsCatalog,
};
