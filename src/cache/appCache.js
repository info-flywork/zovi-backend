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

const profileViewersCache = new TtlCache({
  name: 'profile_viewers',
  max: 2_000,
  defaultTtlMs: 45_000,
});

const placesNearbyCache = new TtlCache({
  name: 'places_nearby',
  max: 2_000,
  defaultTtlMs: 15 * 60_000,
});

/**
 * Gates ChatRepository.promoteAllSenderInboxes — a bulk repair UPDATE that's
 * cheap to skip on repeat polls (client re-lists conversations every ~2s).
 * Correctness only needs this to eventually run, not on every single call.
 */
const chatRepairCache = new TtlCache({
  name: 'chat_repair',
  max: 5_000,
  defaultTtlMs: 30_000,
});

const followersCache = new TtlCache({
  name: 'followers',
  max: 3_000,
  defaultTtlMs: 30_000,
});

const followingCache = new TtlCache({
  name: 'following',
  max: 3_000,
  defaultTtlMs: 30_000,
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

function publicProfileByIdKey(viewerId, userId) {
  return `profid:${viewerId}:${String(userId || '').trim()}`;
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

function profileViewersKey(userId, { limit = 50, offset = 0 } = {}) {
  return `viewers:${userId}:${limit}:${offset}`;
}

function chatRepairKey(userId) {
  return `repair:${userId}`;
}

/** Followers/following are viewer-scoped (per-row relationship flags). */
function followersKey(viewerId, targetId, { limit = 50, offset = 0 } = {}) {
  return `followers:${targetId}:${viewerId}:${limit}:${offset}`;
}

function followingKey(viewerId, targetId, { limit = 50, offset = 0 } = {}) {
  return `following:${targetId}:${viewerId}:${limit}:${offset}`;
}

/** Invalidate every cached page of `userId`'s followers list. */
function invalidateFollowers(userId) {
  if (!userId) return;
  followersCache.deletePrefix(`followers:${userId}:`);
}

/** Invalidate every cached page of `userId`'s following list. */
function invalidateFollowing(userId) {
  if (!userId) return;
  followingCache.deletePrefix(`following:${userId}:`);
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
  profileViewersCache.deletePrefix(`viewers:${userId}:`);
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

function invalidateProfileViewers(userId) {
  if (!userId) return;
  profileViewersCache.deletePrefix(`viewers:${userId}:`);
}

module.exports = {
  meCache,
  storyFeedCache,
  publicProfileCache,
  mapNearbyCache,
  stampsCatalogCache,
  friendshipStreaksCache,
  placesNearbyCache,
  profileViewersCache,
  chatRepairCache,
  followersCache,
  followingCache,
  meKey,
  storyFeedKey,
  publicProfileKey,
  publicProfileByIdKey,
  mapNearbyKey,
  stampsCatalogKey,
  friendshipStreaksKey,
  placesNearbyKey,
  profileViewersKey,
  chatRepairKey,
  followersKey,
  followingKey,
  roundCoord,
  invalidateUser,
  invalidateUsername,
  invalidateStoryFeeds,
  invalidateMapNearby,
  invalidatePlacesNearby,
  invalidateStampsCatalog,
  invalidateProfileViewers,
  invalidateFollowers,
  invalidateFollowing,
};
