'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/database');
const { StampRepository } = require('./StampRepository');
const { NotificationService } = require('./NotificationService');
const { logger } = require('../utils/logger');

function placeKey(name, lat, lng) {
  const n = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const rLat = Math.round(Number(lat) * 1000) / 1000;
  const rLng = Math.round(Number(lng) * 1000) / 1000;
  return `${n}|${rLat}|${rLng}`;
}

function orderedPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

/** Active map markers expire after this many hours. */
const CHECK_IN_MAP_TTL_HOURS = 24;

class CheckInService {
  constructor({
    stamps = new StampRepository(),
    notifications = new NotificationService(),
  } = {}) {
    this.stamps = stamps;
    this.notifications = notifications;
  }

  async listRewardRules() {
    return query(
      `SELECT code, coins, message_key, icon_key, sort_order
       FROM coin_reward_rules
       WHERE is_active = 1
       ORDER BY sort_order ASC`,
    );
  }

  async findOrCreateVenue({ name, lat, lng, category = 'other', subtitle = null }) {
    const key = placeKey(name, lat, lng);
    const existing = await query(
      `SELECT * FROM venues WHERE place_key = ? LIMIT 1`,
      [key],
    );
    if (existing[0]) {
      const newCat = normalizeCheckInCategory(category) || 'other';
      const prevCat = String(existing[0].category || 'other').trim().toLowerCase();
      if (prevCat === 'other' && newCat !== 'other') {
        await query(`UPDATE venues SET category = ? WHERE id = ?`, [
          newCat,
          existing[0].id,
        ]);
        existing[0].category = newCat;
      }
      return existing[0];
    }

    const id = randomUUID();
    const safeCategory = normalizeCheckInCategory(category) || 'other';
    await query(
      `INSERT INTO venues (id, name, category, subtitle, lat, lng, place_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, String(name).trim().slice(0, 200), safeCategory, subtitle, lat, lng, key],
    );
    const rows = await query(`SELECT * FROM venues WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async create({
    userId,
    placeName,
    lat,
    lng,
    caption = '',
    photoPrivacy = 'public',
    taggedUserIds = [],
    photoUrls = [],
    category = 'other',
    locale = 'en',
  }) {
    if (!userId || !placeName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      const err = new Error('Invalid check-in payload');
      err.status = 400;
      err.code = 'INVALID_CHECK_IN';
      throw err;
    }

    const venue = await this.findOrCreateVenue({
      name: placeName,
      lat,
      lng,
      category,
    });

    const profileRows = await query(
      `SELECT check_ins_count, coins
       FROM user_profiles WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    const profile = profileRows[0] || { check_ins_count: 0, coins: 0 };
    const isFirstEver = Number(profile.check_ins_count || 0) === 0;

    const priorAtVenue = await query(
      `SELECT id FROM check_ins
       WHERE user_id = ? AND venue_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [userId, venue.id],
    );
    const isFirstAtVenue = priorAtVenue.length === 0;

    const anyAtVenue = await query(
      `SELECT id FROM check_ins
       WHERE venue_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [venue.id],
    );
    const isVenueFounder = anyAtVenue.length === 0;

    const friendPrior = await query(
      `SELECT ci.id
       FROM check_ins ci
       INNER JOIN follows f
         ON f.follower_id = ? AND f.following_id = ci.user_id
       WHERE ci.venue_id = ? AND ci.deleted_at IS NULL
       LIMIT 1`,
      [userId, venue.id],
    );
    const isFirstAmongFriends = friendPrior.length === 0;

    const tags = [
      ...new Set(
        (taggedUserIds || [])
          .map((id) => String(id || '').trim())
          .filter((id) => id && id !== userId),
      ),
    ].slice(0, 20);
    const hasPhoto = (photoUrls || []).length > 0;
    const hasFriend = tags.length > 0;

    const rules = await this.listRewardRules();
    const ruleByCode = new Map(rules.map((r) => [r.code, r]));

    const rewards = [];
    const pushReward = (code, namedArgs = {}) => {
      const rule = ruleByCode.get(code);
      if (!rule) return;
      rewards.push({
        code: rule.code,
        coins: Number(rule.coins),
        messageKey: rule.message_key,
        iconKey: rule.icon_key,
        namedArgs,
      });
    };

    if (isFirstEver) pushReward('first_ever');
    if (isFirstAtVenue) {
      pushReward('first_at_venue', { place: String(placeName).trim() });
    }
    if (isFirstAmongFriends) pushReward('first_among_friends');
    if (hasPhoto) pushReward('with_photo');
    pushReward('explore');
    if (hasFriend) {
      let friendName = '';
      if (tags.length > 0) {
        const nameRows = await query(
          `SELECT full_name, username FROM user_profiles WHERE user_id = ? LIMIT 1`,
          [tags[0]],
        );
        const row = nameRows[0];
        friendName = (row?.full_name || row?.username || '').trim();
      }
      pushReward('with_friend', { name: friendName || 'friend' });
    }

    const totalCoins = rewards.reduce((sum, r) => sum + r.coins, 0);
    const checkInId = randomUUID();
    const offeredStamp =
      totalCoins > 0
        ? await this.stamps.pickUnownedRandom(userId, { locale })
        : null;
    const privacy =
      photoPrivacy === 'friends' || photoPrivacy === 'friends_only'
        ? 'friends'
        : 'public';

    const txResult = await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE check_ins SET is_active_on_map = 0
         WHERE user_id = ? AND is_active_on_map = 1 AND deleted_at IS NULL`,
        [userId],
      );

      const photoUrlsJson =
        Array.isArray(photoUrls) && photoUrls.length > 0
          ? JSON.stringify(
              photoUrls
                .map((u) => String(u || '').trim())
                .filter(Boolean)
                .slice(0, 12),
            )
          : null;

      await conn.execute(
        `INSERT INTO check_ins (
           id, user_id, venue_id, place_name, caption, lat, lng,
           photo_privacy, photo_urls_json, coins_earned, is_venue_founder, is_first_ever,
           offered_stamp_id, is_active_on_map, checked_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(3))`,
        [
          checkInId,
          userId,
          venue.id,
          String(placeName).trim().slice(0, 200),
          String(caption || '').trim().slice(0, 160) || null,
          lat,
          lng,
          privacy,
          photoUrlsJson,
          totalCoins,
          isVenueFounder ? 1 : 0,
          isFirstEver ? 1 : 0,
          offeredStamp?.id || null,
        ],
      );

      for (const taggedId of tags) {
        await conn.execute(
          `INSERT IGNORE INTO check_in_tags (check_in_id, tagged_user_id)
           VALUES (?, ?)`,
          [checkInId, taggedId],
        );
      }

      let balance = Number(profile.coins || 0);
      for (const reward of rewards) {
        balance += reward.coins;
        await conn.execute(
          `INSERT INTO coin_transactions
             (id, user_id, delta, reason, source_type, source_id, balance_after)
           VALUES (?, ?, ?, ?, 'check_in', ?, ?)`,
          [randomUUID(), userId, reward.coins, reward.code, checkInId, balance],
        );
      }

      await conn.execute(
        `UPDATE user_profiles
         SET coins = ?,
             check_ins_count = check_ins_count + 1
         WHERE user_id = ?`,
        [balance, userId],
      );

      const pairs = [];
      for (const taggedId of tags) {
        const [low, high] = orderedPair(userId, taggedId);
        await conn.execute(
          `INSERT INTO friendship_streaks
             (user_low_id, user_high_id, streak_count, last_check_in_id)
           VALUES (?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             streak_count = streak_count + 1,
             last_check_in_id = VALUES(last_check_in_id),
             updated_at = CURRENT_TIMESTAMP(3)`,
          [low, high, checkInId],
        );
        const [rows] = await conn.execute(
          `SELECT streak_count FROM friendship_streaks
           WHERE user_low_id = ? AND user_high_id = ? LIMIT 1`,
          [low, high],
        );
        pairs.push({
          peerUserId: taggedId,
          streakCount: Number(rows[0]?.streak_count || 1),
        });
      }

      return { pairs, balance };
    });

    let founderOffer = null;
    if (isVenueFounder) {
      const titleRows = await query(
        `SELECT * FROM titles WHERE slug = 'founder_king' LIMIT 1`,
      );
      const title = titleRows[0];
      const stamp = await this.stamps.findBySlug('founder');
      founderOffer = {
        titleId: title?.id || null,
        titleSlug: title?.slug || 'founder_king',
        titleLabel: title?.label || 'Kurucu Kral',
        titleEmoji: title?.emoji || '👑',
        stampSlug: 'founder',
        stampImageUrl: stamp?.cdnUrl || null,
        stampId: stamp?.id || null,
      };
    }

    // Tag notifications after commit — don't fail the check-in if push fails.
    for (const taggedId of tags) {
      try {
        await this.notifications.notifyCheckInTagged({
          recipientId: taggedId,
          actorId: userId,
          checkInId,
          placeName: String(placeName).trim(),
        });
      } catch (err) {
        logger.error('check_in_tag_notify_failed', {
          err: err.message,
          taggedId,
          checkInId,
        });
      }
    }

    logger.info('check_in_created', {
      userId,
      checkInId,
      placeName: String(placeName).trim(),
      taggedCount: tags.length,
      totalCoins,
      isVenueFounder,
    });

    return {
      checkIn: {
        id: checkInId,
        placeName: String(placeName).trim(),
        lat,
        lng,
        coinsEarned: totalCoins,
        isVenueFounder,
        isFirstEver,
        checkedAt: new Date().toISOString(),
        photoUrls: photoUrls || [],
        taggedUserIds: tags,
      },
      rewards,
      totalCoins,
      coinsBalance: txResult.balance,
      founderOffer,
      stampOffer: offeredStamp
        ? {
            stampId: offeredStamp.id,
            slug: offeredStamp.slug,
            name: offeredStamp.localizedName || offeredStamp.slug,
            imageUrl: offeredStamp.cdnUrl || null,
            coinCost: totalCoins,
          }
        : null,
      friendshipStreaks: txResult.pairs,
    };
  }

  async getActiveOnMap(userId) {
    if (!userId) return null;
    // Best-effort cleanup so stale pins don't linger forever.
    await query(
      `UPDATE check_ins
       SET is_active_on_map = 0
       WHERE user_id = ?
         AND is_active_on_map = 1
         AND deleted_at IS NULL
         AND checked_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR)`,
      [userId, CHECK_IN_MAP_TTL_HOURS],
    );
    const rows = await query(
      `SELECT
         ci.*,
         t.label AS title_label,
         t.emoji AS title_emoji,
         t.slug AS title_slug,
         offered.cdn_url AS offered_stamp_cdn_url,
         offered.slug AS offered_stamp_slug
       FROM check_ins ci
       LEFT JOIN user_profiles up ON up.user_id = ci.user_id
       LEFT JOIN titles t ON t.id = up.equipped_title_id
       LEFT JOIN stamps offered ON offered.id = ci.offered_stamp_id
       WHERE ci.user_id = ?
         AND ci.is_active_on_map = 1
         AND ci.deleted_at IS NULL
         AND ci.checked_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR)
       ORDER BY ci.checked_at DESC
       LIMIT 1`,
      [userId, CHECK_IN_MAP_TTL_HOURS],
    );
    const row = rows[0];
    if (!row) return null;

    const photoUrls = await this._photoUrlsForRow(row);

    let stampImageUrl = null;
    let stampSlug = null;
    if (row.stamp_accepted_at && row.offered_stamp_cdn_url) {
      stampImageUrl = row.offered_stamp_cdn_url;
      stampSlug = row.offered_stamp_slug || null;
    } else if (Number(row.is_venue_founder)) {
      const stamp = await this.stamps.findBySlug('founder');
      stampImageUrl = stamp?.cdnUrl || null;
      stampSlug = 'founder';
    }

    const titleLabel = row.title_label
      ? `${row.title_emoji || '👑'} ${row.title_label}`.trim()
      : null;

    return {
      id: row.id,
      placeName: row.place_name,
      lat: Number(row.lat),
      lng: Number(row.lng),
      checkedAt: row.checked_at,
      photoUrls,
      isVenueFounder: Boolean(Number(row.is_venue_founder)),
      stampImageUrl,
      stampSlug,
      titleLabel,
    };
  }

  /**
   * Profile check-in history. Photos respect photo_privacy for non-self viewers.
   */
  async listForUser(
    ownerUserId,
    { viewerId = null, viewerFollows = false, limit = 60, offset = 0 } = {},
  ) {
    if (!ownerUserId) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const isSelf = Boolean(viewerId && viewerId === ownerUserId);
    const canSeeFriendsPhotos = isSelf || viewerFollows;

    const rows = await query(
      `SELECT *
       FROM check_ins
       WHERE user_id = ?
         AND deleted_at IS NULL
       ORDER BY checked_at DESC
       LIMIT ? OFFSET ?`,
      [ownerUserId, safeLimit, safeOffset],
    );

    const items = [];
    for (const row of rows) {
      const privacy = String(row.photo_privacy || 'public').toLowerCase();
      const hidePhotos = privacy === 'friends' && !canSeeFriendsPhotos;
      const photoUrls = hidePhotos ? [] : await this._photoUrlsForRow(row);
      items.push({
        id: row.id,
        placeName: row.place_name,
        caption: row.caption || '',
        lat: Number(row.lat),
        lng: Number(row.lng),
        photoPrivacy: privacy,
        photoUrls,
        checkedAt: row.checked_at,
        isActiveOnMap: Boolean(Number(row.is_active_on_map)),
        isVenueFounder: Boolean(Number(row.is_venue_founder)),
      });
    }
    return items;
  }

  async _photoUrlsForRow(row) {
    let photoUrls = [];
    try {
      const parsed = row.photo_urls_json ? JSON.parse(row.photo_urls_json) : [];
      if (Array.isArray(parsed)) {
        photoUrls = parsed
          .map((u) => String(u || '').trim())
          .filter(Boolean);
      }
    } catch (_) {
      photoUrls = [];
    }

    if (photoUrls.length === 0) {
      const pulses = await query(
        `SELECT media_url
         FROM pulses
         WHERE user_id = ?
           AND source_type = 'check_in'
           AND deleted_at IS NULL
           AND created_at BETWEEN DATE_SUB(?, INTERVAL 15 MINUTE) AND DATE_ADD(?, INTERVAL 15 MINUTE)
         ORDER BY created_at ASC
         LIMIT 12`,
        [row.user_id, row.checked_at, row.checked_at],
      );
      photoUrls = pulses
        .map((p) => String(p.media_url || '').trim())
        .filter(Boolean);
    }
    return photoUrls;
  }

  async acceptFounderReward({ userId, checkInId }) {

    const rows = await query(
      `SELECT * FROM check_ins
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [checkInId, userId],
    );
    const checkIn = rows[0];
    if (!checkIn) {
      const err = new Error('Check-in not found');
      err.status = 404;
      err.code = 'CHECK_IN_NOT_FOUND';
      throw err;
    }
    if (!Number(checkIn.is_venue_founder)) {
      const err = new Error('Not a venue founder check-in');
      err.status = 400;
      err.code = 'NOT_FOUNDER';
      throw err;
    }

    const titleRows = await query(
      `SELECT * FROM titles WHERE slug = 'founder_king' LIMIT 1`,
    );
    const title = titleRows[0];
    if (!title) {
      const err = new Error('Founder title missing');
      err.status = 500;
      throw err;
    }

    await this.stamps.awardToUser(userId, 'founder', {
      source: `check_in:${checkInId}`,
    });

    await query(
      `INSERT INTO user_titles (id, user_id, title_id, source_check_in_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE source_check_in_id = VALUES(source_check_in_id)`,
      [randomUUID(), userId, title.id, checkInId],
    );

    await query(
      `UPDATE user_profiles SET equipped_title_id = ? WHERE user_id = ?`,
      [title.id, userId],
    );

    const stamp = await this.stamps.findBySlug('founder');
    return {
      accepted: true,
      title: {
        id: title.id,
        slug: title.slug,
        label: title.label,
        emoji: title.emoji,
      },
      stamp: stamp
        ? {
            id: stamp.id,
            slug: stamp.slug,
            imageUrl: stamp.cdnUrl || null,
            name: stamp.localizedName || 'Founder',
          }
        : null,
    };
  }

  async acceptStampOffer({ userId, checkInId }) {
    const tx = await withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT * FROM check_ins
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [checkInId, userId],
      );
      const checkIn = rows[0];
      if (!checkIn) {
        const err = new Error('Check-in not found');
        err.status = 404;
        err.code = 'CHECK_IN_NOT_FOUND';
        throw err;
      }
      if (checkIn.stamp_accepted_at) {
        const err = new Error('Stamp offer already accepted');
        err.status = 409;
        err.code = 'STAMP_ALREADY_ACCEPTED';
        throw err;
      }
      const stampId = checkIn.offered_stamp_id;
      if (!stampId) {
        const err = new Error('No stamp offer on this check-in');
        err.status = 400;
        err.code = 'NO_STAMP_OFFER';
        throw err;
      }
      const cost = Number(checkIn.coins_earned) || 0;
      if (cost <= 0) {
        const err = new Error('No coins to spend');
        err.status = 400;
        err.code = 'NO_COINS';
        throw err;
      }

      const [owned] = await conn.execute(
        `SELECT stamp_id FROM user_stamps
         WHERE user_id = ? AND stamp_id = ?
         LIMIT 1`,
        [userId, stampId],
      );
      if (owned[0]) {
        const err = new Error('Stamp already owned');
        err.status = 409;
        err.code = 'STAMP_ALREADY_OWNED';
        throw err;
      }

      const [profiles] = await conn.execute(
        `SELECT coins FROM user_profiles
         WHERE user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [userId],
      );
      const balance = Number(profiles[0]?.coins || 0);
      if (balance < cost) {
        const err = new Error('Not enough coins');
        err.status = 400;
        err.code = 'INSUFFICIENT_COINS';
        throw err;
      }

      await conn.execute(
        `INSERT INTO user_stamps (user_id, stamp_id, source)
         VALUES (?, ?, 'check_in')`,
        [userId, stampId],
      );

      const nextBalance = balance - cost;
      await conn.execute(
        `INSERT INTO coin_transactions
           (id, user_id, delta, reason, source_type, source_id, balance_after)
         VALUES (?, ?, ?, 'stamp_unlock', 'check_in', ?, ?)`,
        [randomUUID(), userId, -cost, checkInId, nextBalance],
      );
      await conn.execute(
        `UPDATE user_profiles SET coins = ? WHERE user_id = ?`,
        [nextBalance, userId],
      );
      await conn.execute(
        `UPDATE check_ins
         SET stamp_accepted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [checkInId],
      );

      return { cost, nextBalance, stampId };
    });

    const stamp = await this.stamps.findById(tx.stampId);
    logger.info('stamp_offer_accepted', {
      userId,
      checkInId,
      stampId: tx.stampId,
      coinsSpent: tx.cost,
    });
    return {
      accepted: true,
      coinsSpent: tx.cost,
      coinsBalance: tx.nextBalance,
      stamp: stamp
        ? {
            id: stamp.id,
            slug: stamp.slug,
            name: stamp.localizedName || stamp.slug,
            imageUrl: stamp.cdnUrl || null,
          }
        : null,
    };
  }

  async listFriendshipStreaks(userId, { limit = 50 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows = await query(
      `SELECT
         fs.streak_count,
         fs.updated_at,
         CASE WHEN fs.user_low_id = ? THEN fs.user_high_id ELSE fs.user_low_id END AS peer_id,
         up.full_name,
         up.username,
         up.avatar_url
       FROM friendship_streaks fs
       INNER JOIN user_profiles up
         ON up.user_id = CASE
           WHEN fs.user_low_id = ? THEN fs.user_high_id
           ELSE fs.user_low_id
         END
       WHERE fs.user_low_id = ? OR fs.user_high_id = ?
       ORDER BY fs.streak_count DESC, fs.updated_at DESC
       LIMIT ?`,
      [userId, userId, userId, userId, safeLimit],
    );

    const catRows = await query(
      `SELECT
         CASE
           WHEN ci.user_id = ? THEN t.tagged_user_id
           ELSE ci.user_id
         END AS peer_id,
         LOWER(TRIM(COALESCE(v.category, 'other'))) AS category
       FROM check_ins ci
       INNER JOIN check_in_tags t ON t.check_in_id = ci.id
       LEFT JOIN venues v ON v.id = ci.venue_id
       WHERE ci.deleted_at IS NULL
         AND (ci.user_id = ? OR t.tagged_user_id = ?)`,
      [userId, userId, userId],
    );

    const categoriesByPeer = new Map();
    for (const row of catRows) {
      const peerId = String(row.peer_id || '').trim();
      if (!peerId || peerId === userId) continue;
      const category = normalizeCheckInCategory(row.category);
      if (!category) continue;
      const set = categoriesByPeer.get(peerId) || new Set();
      set.add(category);
      categoriesByPeer.set(peerId, set);
    }

    return rows.map((r) => {
      const peerId = String(r.peer_id || '').trim();
      const cats = [...(categoriesByPeer.get(peerId) || [])];
      return {
        peerUserId: peerId,
        name: r.full_name || r.username || 'user',
        username: r.username || '',
        avatarUrl: r.avatar_url || '',
        streakCount: Number(r.streak_count || 0),
        updatedAt: r.updated_at,
        categories: cats,
      };
    });
  }
}

function normalizeCheckInCategory(raw) {
  const c = String(raw || '')
    .trim()
    .toLowerCase();
  if (c === 'food' || c === 'restaurant') return 'restaurant';
  if (c === 'coffee' || c === 'cafe') return 'cafe';
  if (
    c === 'culture' ||
    c === 'restaurant' ||
    c === 'cafe' ||
    c === 'gym' ||
    c === 'music' ||
    c === 'park'
  ) {
    return c;
  }
  return null;
}

module.exports = { CheckInService, placeKey, normalizeCheckInCategory };
