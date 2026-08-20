'use strict';

const { query } = require('../config/database');

/** Last-known map pin stays visible this long after the last location sync.
 *  Friends should remain on the map even when the app is closed — not only
 *  while they are actively using it. */
const PRESENCE_TTL_MINUTES = 7 * 24 * 60;
/** Check-in pins on the social map expire after 24h. */
const CHECK_IN_MAP_TTL_HOURS = 24;

const STAMP_JOIN = `
       LEFT JOIN (
         SELECT us.user_id, st.slug AS stamp_slug, st.cdn_url AS stamp_cdn_url
         FROM user_stamps us
         INNER JOIN stamps st ON st.id = us.stamp_id AND st.is_active = 1
         INNER JOIN (
           SELECT user_id, MIN(stamp_id) AS stamp_id
           FROM user_stamps
           GROUP BY user_id
         ) pick ON pick.user_id = us.user_id AND pick.stamp_id = us.stamp_id
       ) earned_stamp ON earned_stamp.user_id = mp.user_id`;

function haversineMetersSql() {
  return `(
    6371000 * ACOS(
      LEAST(
        1,
        GREATEST(
          -1,
          COS(RADIANS(?)) * COS(RADIANS(mp.lat)) * COS(RADIANS(mp.lng) - RADIANS(?))
          + SIN(RADIANS(?)) * SIN(RADIANS(mp.lat))
        )
      )
    )
  )`;
}

function parsePhotoUrls(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch (_) {
    return [];
  }
}

class MapPresenceRepository {
  mapFriendRow(row) {
    if (!row) return null;
    const distanceMeters =
      row.distance_m == null ? null : Math.round(Number(row.distance_m));

    const isPrivate =
      String(row.account_privacy || 'public').toLowerCase() === 'friends';
    const hideIdentity = Boolean(Number(row.is_anonymous)) || isPrivate;

    let activeCheckIn = null;
    if (row.check_in_id && !hideIdentity) {
      const titleLabel = row.title_label
        ? `${row.title_emoji || '👑'} ${row.title_label}`.trim()
        : null;
      const stampSlug = row.stamp_slug
        || (Number(row.check_in_is_founder) ? 'founder' : null);
      activeCheckIn = {
        id: row.check_in_id,
        placeName: row.check_in_place_name || '',
        checkedAt: row.check_in_checked_at || null,
        photoUrls: parsePhotoUrls(row.check_in_photo_urls),
        isVenueFounder: Boolean(Number(row.check_in_is_founder)),
        stampSlug,
        stampUrl: row.stamp_cdn_url || '',
        titleLabel,
        photoPrivacy: row.check_in_photo_privacy || 'public',
      };
    }

    const isFriend =
      row.is_followed == null ? true : Boolean(Number(row.is_followed));

    return {
      userId: row.user_id,
      username: hideIdentity ? '' : (row.username || ''),
      fullName: hideIdentity ? 'Anonim' : (row.full_name || row.username || ''),
      avatarUrl: hideIdentity ? '' : (row.avatar_url || ''),
      streakCount: hideIdentity ? 0 : Number(row.pair_streak_count || 0),
      lat: Number(row.lat),
      lng: Number(row.lng),
      distanceMeters,
      locationText: hideIdentity
        ? ''
        : (row.location_label || row.location_text || ''),
      updatedAt: row.updated_at,
      isAnonymous: hideIdentity,
      isFriend,
      activeCheckIn,
    };
  }

  mapAnonRow(row) {
    if (!row) return null;
    const distanceMeters =
      row.distance_m == null ? null : Math.round(Number(row.distance_m));
    return {
      userId: row.user_id || null,
      username: '',
      fullName: 'Anonim',
      avatarUrl: '',
      streakCount: 0,
      lat: Number(row.lat),
      lng: Number(row.lng),
      distanceMeters,
      locationText: '',
      updatedAt: row.updated_at,
      isAnonymous: true,
      isFriend: false,
      activeCheckIn: null,
    };
  }

  async upsert({
    userId,
    lat,
    lng,
    accuracyM = null,
    locationLabel = null,
    isAnonymous = false,
  }) {
    if (!userId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    const safeLat = Math.max(-90, Math.min(90, Number(lat)));
    const safeLng = Math.max(-180, Math.min(180, Number(lng)));
    const label =
      locationLabel == null
        ? null
        : String(locationLabel).trim().slice(0, 120) || null;

    await query(
      `INSERT INTO map_presence (
         user_id, lat, lng, accuracy_m, location_label, is_anonymous, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE))
       ON DUPLICATE KEY UPDATE
         lat = VALUES(lat),
         lng = VALUES(lng),
         accuracy_m = VALUES(accuracy_m),
         location_label = VALUES(location_label),
         is_anonymous = VALUES(is_anonymous),
         updated_at = UTC_TIMESTAMP(3),
         expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)`,
      [
        userId,
        safeLat,
        safeLng,
        accuracyM == null ? null : Number(accuracyM),
        label,
        isAnonymous ? 1 : 0,
        PRESENCE_TTL_MINUTES,
        PRESENCE_TTL_MINUTES,
      ],
    );
    return true;
  }

  /**
   * Friends map layer: only people the viewer follows.
   * Public non-friends live on the Nearby layer instead.
   */
  async listFriendsNearby(viewerId, { lat, lng, radiusMeters = 50000, limit = 80 }) {
    const dist = haversineMetersSql();
    const rows = await query(
      `SELECT
         mp.user_id,
         mp.lat,
         mp.lng,
         mp.location_label,
         mp.is_anonymous,
         mp.updated_at,
         up.username,
         up.full_name,
         up.avatar_url,
         up.location_text,
         up.account_privacy,
         CASE WHEN f.follower_id IS NOT NULL THEN 1 ELSE 0 END AS is_followed,
         COALESCE(fs.streak_count, 0) AS pair_streak_count,
         ci.id AS check_in_id,
         ci.place_name AS check_in_place_name,
         ci.checked_at AS check_in_checked_at,
         ci.photo_urls_json AS check_in_photo_urls,
         ci.is_venue_founder AS check_in_is_founder,
         ci.photo_privacy AS check_in_photo_privacy,
         t.label AS title_label,
         t.emoji AS title_emoji,
         earned_stamp.stamp_slug,
         earned_stamp.stamp_cdn_url,
         ${dist} AS distance_m
       FROM map_presence mp
       INNER JOIN user_profiles up ON up.user_id = mp.user_id
       LEFT JOIN follows f
         ON f.follower_id = ? AND f.following_id = mp.user_id
       LEFT JOIN friendship_streaks fs
         ON (
           (fs.user_low_id = ? AND fs.user_high_id = mp.user_id)
           OR (fs.user_high_id = ? AND fs.user_low_id = mp.user_id)
         )
       LEFT JOIN check_ins ci
         ON ci.user_id = mp.user_id
         AND ci.is_active_on_map = 1
         AND ci.deleted_at IS NULL
         AND ci.checked_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR)
         AND (
           ci.photo_privacy = 'public'
           OR (
             ci.photo_privacy IN ('friends', 'friends_only')
             AND f.follower_id IS NOT NULL
           )
         )
       LEFT JOIN titles t ON t.id = up.equipped_title_id
       ${STAMP_JOIN}
       WHERE mp.user_id <> ?
         AND mp.updated_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
         AND mp.is_anonymous = 0
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = mp.user_id)
              OR (b.blocker_id = mp.user_id AND b.blocked_id = ?)
         )
         AND (
           f.follower_id IS NOT NULL
         )
       HAVING distance_m <= ?
       ORDER BY distance_m ASC
       LIMIT ?`,
      [
        lat,
        lng,
        lat,
        viewerId,
        viewerId,
        viewerId,
        CHECK_IN_MAP_TTL_HOURS,
        viewerId,
        PRESENCE_TTL_MINUTES,
        viewerId,
        viewerId,
        radiusMeters,
        limit,
      ],
    );
    return rows.map((r) => this.mapFriendRow(r)).filter(Boolean);
  }

  /**
   * Nearby layer: strangers. Public accounts with a photo stay identifiable;
   * private / anonymous accounts render as hidden pins.
   */
  async listAnonNearby(viewerId, { lat, lng, radiusMeters = 50000, limit = 80 }) {
    const dist = haversineMetersSql();
    const rows = await query(
      `SELECT
         mp.user_id,
         mp.lat,
         mp.lng,
         mp.location_label,
         mp.is_anonymous,
         mp.updated_at,
         up.username,
         up.full_name,
         up.avatar_url,
         up.location_text,
         up.account_privacy,
         0 AS is_followed,
         0 AS pair_streak_count,
         ci.id AS check_in_id,
         ci.place_name AS check_in_place_name,
         ci.checked_at AS check_in_checked_at,
         ci.photo_urls_json AS check_in_photo_urls,
         ci.is_venue_founder AS check_in_is_founder,
         ci.photo_privacy AS check_in_photo_privacy,
         t.label AS title_label,
         t.emoji AS title_emoji,
         earned_stamp.stamp_slug,
         earned_stamp.stamp_cdn_url,
         ${dist} AS distance_m
       FROM map_presence mp
       INNER JOIN user_profiles up ON up.user_id = mp.user_id
       LEFT JOIN check_ins ci
         ON ci.user_id = mp.user_id
         AND ci.is_active_on_map = 1
         AND ci.deleted_at IS NULL
         AND ci.checked_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR)
         AND ci.photo_privacy = 'public'
       LEFT JOIN titles t ON t.id = up.equipped_title_id
       ${STAMP_JOIN}
       WHERE mp.user_id <> ?
         AND mp.updated_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
         AND (
           COALESCE(up.account_privacy, 'public') = 'friends'
           OR (
             mp.is_anonymous = 0
             AND up.avatar_url IS NOT NULL
             AND TRIM(up.avatar_url) <> ''
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM follows f
           WHERE f.follower_id = ? AND f.following_id = mp.user_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = mp.user_id)
              OR (b.blocker_id = mp.user_id AND b.blocked_id = ?)
         )
       HAVING distance_m <= ?
       ORDER BY distance_m ASC
       LIMIT ?`,
      [
        lat,
        lng,
        lat,
        CHECK_IN_MAP_TTL_HOURS,
        viewerId,
        PRESENCE_TTL_MINUTES,
        viewerId,
        viewerId,
        viewerId,
        radiusMeters,
        limit,
      ],
    );
    return rows.map((r) => this.mapFriendRow(r)).filter(Boolean);
  }
}

module.exports = { MapPresenceRepository, PRESENCE_TTL_MINUTES, CHECK_IN_MAP_TTL_HOURS };
