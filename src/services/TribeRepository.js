'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/database');
const {
  DISTRICTS,
  districtForCoords,
  haversineKm,
} = require('../utils/istanbulDistricts');
const { normalizeCheckInCategory } = require('./CheckInService');
const { localizeMockNameFields } = require('../utils/mockNameI18n');

const DISTRICT_CENTROID = new Map(DISTRICTS.map((d) => [d.key, d]));

/**
 * Category emojis are used as a fallback when a tribe row has none set,
 * so auto-created tribes (Phase 1 cron) always render something.
 */
const CATEGORY_EMOJI = {
  music: '🎵',
  cafe: '☕',
  park: '🌳',
  culture: '🏛️',
  restaurant: '🍽️',
  gym: '🏃',
  other: '✨',
};

const MANUAL_TRIBE_COIN_COST = 100;

function normalizeCategory(raw) {
  const aliased = normalizeCheckInCategory(raw);
  if (aliased) return aliased;
  const value = String(raw || 'other').trim().toLowerCase();
  return CATEGORY_EMOJI[value] ? value : 'other';
}

function mergeProgress(map, category, value) {
  const cat = normalizeCategory(category);
  const n = Number(value) || 0;
  if (n <= 0) return;
  map.set(cat, Math.max(map.get(cat) || 0, n));
}

/**
 * Algorithmic tribes. Membership has two states in the DB (eligible/member);
 * for the client each tribe resolves to one of three display states:
 *   member   -> user opted in, group chat open (tappable list row)
 *   unlocked -> algorithm invitation OR streak threshold crossed, awaiting
 *               the user's opt-in "Gruba Katıl" tap (featured card)
 *   locked   -> still building the streak ("8/10")
 */
class TribeRepository {
  /**
   * Per-category streak score for tribe unlock UI — matches what Lifestyle
   * Streak surfaces: distinct check-in days plus friend-tagged check-ins in
   * that category (each tagged check-in bumps the pair streak).
   * @returns {Promise<Map<string, number>>} category -> score (0..threshold)
   */
  async categoryProgress(userId) {
    const [dayRows, taggedRows, friendshipByCategory] = await Promise.all([
      query(
        `SELECT
           LOWER(TRIM(COALESCE(v.category, 'other'))) AS category,
           COUNT(DISTINCT DATE(ci.checked_at)) AS days
         FROM check_ins ci
         LEFT JOIN venues v ON v.id = ci.venue_id
         WHERE ci.user_id = ? AND ci.deleted_at IS NULL
         GROUP BY category`,
        [userId],
      ),
      query(
        `SELECT
           LOWER(TRIM(COALESCE(v.category, 'other'))) AS category,
           COUNT(*) AS taggedCheckIns
         FROM check_ins ci
         INNER JOIN check_in_tags t ON t.check_in_id = ci.id
         LEFT JOIN venues v ON v.id = ci.venue_id
         WHERE ci.user_id = ? AND ci.deleted_at IS NULL
         GROUP BY category`,
        [userId],
      ),
      this._friendshipStreakByCategory(userId),
    ]);

    const map = new Map();
    for (const row of dayRows) {
      mergeProgress(map, row.category, row.days);
    }
    for (const row of taggedRows) {
      mergeProgress(map, row.category, row.taggedCheckIns);
    }
    for (const [cat, score] of friendshipByCategory) {
      mergeProgress(map, cat, score);
    }
    return map;
  }

  /**
   * Pair streak totals attributed to categories the pair has shared on
   * tagged check-ins — mirrors Lifestyle Streak rows.
   */
  async _friendshipStreakByCategory(userId) {
    const streakRows = await query(
      `SELECT
         CASE WHEN fs.user_low_id = ? THEN fs.user_high_id ELSE fs.user_low_id END AS peer_id,
         fs.streak_count
       FROM friendship_streaks fs
       WHERE fs.user_low_id = ? OR fs.user_high_id = ?`,
      [userId, userId, userId],
    );
    const streakByPeer = new Map();
    for (const row of streakRows) {
      const peer = String(row.peer_id || '').trim();
      if (!peer) continue;
      streakByPeer.set(peer, Number(row.streak_count) || 0);
    }
    if (streakByPeer.size === 0) return new Map();

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

    const map = new Map();
    for (const row of catRows) {
      const peer = String(row.peer_id || '').trim();
      if (!peer || peer === userId) continue;
      const streak = streakByPeer.get(peer) || 0;
      if (streak <= 0) continue;
      mergeProgress(map, row.category, streak);
    }
    return map;
  }

  /** @deprecated alias — use categoryProgress */
  async categoryStreakDays(userId) {
    return this.categoryProgress(userId);
  }

  async membershipMap(userId) {
    const rows = await query(
      `SELECT tribe_id, state, progress FROM tribe_members WHERE user_id = ?`,
      [userId],
    );
    const map = new Map();
    for (const row of rows) {
      map.set(String(row.tribe_id), {
        state: row.state,
        progress: Number(row.progress) || 0,
      });
    }
    return map;
  }

  /**
   * Member counts + up to 3 avatars, scoped to the tribes on screen.
   */
  async membersByTribeIds(tribeIds) {
    const ids = [...new Set((tribeIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const map = new Map();
    if (ids.length === 0) return map;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query(
      `SELECT tm.tribe_id, up.avatar_url
       FROM tribe_members tm
       INNER JOIN user_profiles up ON up.user_id = tm.user_id
       WHERE tm.state = 'member' AND tm.tribe_id IN (${placeholders})
       ORDER BY tm.joined_at DESC, tm.created_at DESC`,
      ids,
    );
    for (const row of rows) {
      const key = String(row.tribe_id);
      const entry = map.get(key) || { count: 0, avatars: [] };
      entry.count += 1;
      const url = String(row.avatar_url || '').trim();
      if (url && entry.avatars.length < 3) entry.avatars.push(url);
      map.set(key, entry);
    }
    return map;
  }

  /**
   * Best streak of any type: distinct check-in days or friendship streaks.
   */
  async bestStreak(userId) {
    const [dayRows, streakRows] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT DATE(checked_at)) AS days
         FROM check_ins
         WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      ),
      query(
        `SELECT MAX(streak_count) AS streak
         FROM friendship_streaks
         WHERE user_low_id = ? OR user_high_id = ?`,
        [userId, userId],
      ),
    ]);
    return Math.max(
      Number(dayRows[0]?.days) || 0,
      Number(streakRows[0]?.streak) || 0,
    );
  }

  _resolve(tribe, bestStreak, membership, memberInfo) {
    const category = normalizeCategory(tribe.category);
    const threshold = Number(tribe.threshold) || 10;
    const isFeatured = Boolean(tribe.is_featured);
    const isMember = membership?.state === 'member';
    const streak = Number(bestStreak) || 0;
    const progress = isMember ? threshold : Math.min(streak, threshold);
    const unlocked = isMember || streak >= threshold;

    let state = 'locked';
    if (isMember) state = 'member';
    else if (unlocked) state = 'unlocked';

    const photoUrl = String(tribe.photo_url || '').trim();
    const isUserCreated = String(tribe.area_key || '').startsWith('custom-');
    const areaKey = String(tribe.area_key || '');
    const catalogPhoto = areaKey.startsWith('catalog-')
      ? `assets/images/tribes/${areaKey.slice('catalog-'.length)}.jpg`
      : '';
    const resolvedPhoto = photoUrl || catalogPhoto;
    let avatars = [...(memberInfo?.avatars || [])];
    if (isUserCreated && !photoUrl) {
      avatars = [];
    }

    return {
      id: tribe.id,
      category,
      areaKey: tribe.area_key,
      isUserCreated,
      areaLabel: tribe.area_label || '',
      name: tribe.name,
      nameKey: String(tribe.name_key || '').trim(),
      description: tribe.description || '',
      descriptionKey: String(tribe.name_key || '')
        .trim()
        .replace(/^tribe_name_/, 'tribe_desc_'),
      emoji: tribe.emoji || CATEGORY_EMOJI[category],
      cadenceLabel: tribe.cadence_label || '',
      threshold,
      progress,
      progressLabel: `${progress}/${threshold}`,
      remaining: Math.max(threshold - progress, 0),
      state,
      isFeatured,
      memberCount: memberInfo?.count || 0,
      avatars,
      photoUrl: resolvedPhoto,
      ownerUserId: String(tribe.owner_user_id || '').trim(),
      isOwner:
        String(tribe.owner_user_id || '').trim() !== '' &&
        String(tribe.owner_user_id || '').trim() === String(membership?.userId || ''),
      conversationId: tribe.conversation_id || null,
    };
  }

  /**
   * Resolve the user's district context from an explicit coordinate, else from
   * their most recent check-in. Used to rank tribes by proximity.
   * @returns {Promise<{ key: string|null, lat: number, lng: number } | null>}
   */
  async resolveUserContext(userId, lat, lng) {
    const match = districtForCoords(lat, lng);
    if (match) return { key: match.key, lat: Number(lat), lng: Number(lng) };

    const rows = await query(
      `SELECT v.district AS district, v.lat AS lat, v.lng AS lng
       FROM check_ins ci
       INNER JOIN venues v ON v.id = ci.venue_id
       WHERE ci.user_id = ? AND ci.deleted_at IS NULL AND v.district IS NOT NULL
       ORDER BY ci.checked_at DESC
       LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return { key: row.district, lat: Number(row.lat), lng: Number(row.lng) };
  }

  _rankDistanceKm(areaKey, context) {
    if (!context) return Number.POSITIVE_INFINITY;
    if (areaKey && areaKey === context.key) return 0;
    const centroid = DISTRICT_CENTROID.get(String(areaKey || ''));
    if (!centroid || !Number.isFinite(context.lat)) {
      return Number.POSITIVE_INFINITY;
    }
    return haversineKm(context.lat, context.lng, centroid.lat, centroid.lng);
  }

  /**
   * Same default catalogue for every user, plus the user's own custom groups.
   * Featured = unlocked (can join). List = members + locked, paginated.
   */
  async listForUser(userId, { limit = 15, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 15, 1), 50);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const [tribeRows, bestStreak, membership] = await Promise.all([
      query(
        `SELECT * FROM tribes
         WHERE status = 'active'
         ORDER BY sort_order ASC, created_at ASC`,
      ),
      this.bestStreak(userId),
      this.membershipMap(userId),
    ]);

    const featured = [];
    const list = [];
    for (const row of tribeRows) {
      const item = this._resolve(
        row,
        bestStreak,
        {
          ...(membership.get(String(row.id)) || {}),
          userId,
        },
        { count: Number(row.member_count_cache) || 0, avatars: [] },
      );
      if (item.isUserCreated && item.state !== 'member' && !item.isOwner) {
        continue;
      }
      if (item.state === 'unlocked') featured.push(item);
      else list.push(item);
    }

    featured.sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
    list.sort((a, b) => {
      if (a.state !== b.state) {
        if (a.state === 'member') return -1;
        if (b.state === 'member') return 1;
      }
      const aCustom = a.isUserCreated ? 1 : 0;
      const bCustom = b.isUserCreated ? 1 : 0;
      if (aCustom !== bCustom) return bCustom - aCustom;
      return (Number(a.threshold) || 0) - (Number(b.threshold) || 0);
    });

    const featuredPage = safeOffset === 0 ? featured.slice(0, 8) : [];
    const tribesPage = list.slice(safeOffset, safeOffset + safeLimit);
    const pageIds = [...featuredPage, ...tribesPage].map((item) => item.id);
    const members = await this.membersByTribeIds(pageIds);
    const withAvatars = (item) => {
      const info = members.get(String(item.id));
      if (!info) return item;
      item.memberCount = info.count;
      item.avatars = info.avatars;
      return item;
    };

    return {
      featured: featuredPage.map(withAvatars),
      tribes: tribesPage.map(withAvatars),
      hasMore: safeOffset + safeLimit < list.length,
      nextOffset: safeOffset + tribesPage.length,
    };
  }

  async findById(tribeId) {
    const rows = await query(
      `SELECT * FROM tribes WHERE id = ? LIMIT 1`,
      [tribeId],
    );
    return rows[0] || null;
  }

  /**
   * Ensures a group conversation exists for the tribe and returns its id.
   * Tribe chats are normal conversations without a dm_pairs row.
   */
  async ensureConversation(tribeId) {
    const tribe = await this.findById(tribeId);
    if (!tribe) return null;
    if (tribe.conversation_id) return String(tribe.conversation_id);

    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT conversation_id AS conversationId
         FROM tribes WHERE id = ? LIMIT 1 FOR UPDATE`,
        [tribeId],
      );
      const existing = rows?.[0]?.conversationId;
      if (existing) return String(existing);

      const conversationId = randomUUID();
      await conn.execute(`INSERT INTO conversations (id) VALUES (?)`, [
        conversationId,
      ]);
      await conn.execute(
        `UPDATE tribes SET conversation_id = ? WHERE id = ? AND conversation_id IS NULL`,
        [conversationId, tribeId],
      );
      return conversationId;
    });
  }

  async upsertConversationMember(conversationId, userId) {
    if (!conversationId || !userId) return;
    await query(
      `INSERT INTO conversation_members
         (conversation_id, user_id, folder, unread_count, deleted_at)
       VALUES (?, ?, 'inbox', 0, NULL)
       ON DUPLICATE KEY UPDATE
         folder = 'inbox',
         deleted_at = NULL`,
      [conversationId, userId],
    );
  }

  async syncConversationMembers(tribeId, conversationId) {
    if (!conversationId) return;
    const rows = await query(
      `SELECT user_id AS userId
       FROM tribe_members
       WHERE tribe_id = ? AND state = 'member'`,
      [tribeId],
    );
    for (const row of rows) {
      await this.upsertConversationMember(conversationId, String(row.userId));
    }
  }

  async listMembers(tribeId, viewerId) {
    const rows = await query(
      `SELECT
         tm.user_id AS userId,
         up.full_name AS fullName,
         up.username AS username,
         up.avatar_url AS avatarUrl,
         COALESCE(fs.streak_count, 0) AS streakCount,
         tm.joined_at AS joinedAt
       FROM tribe_members tm
       INNER JOIN user_profiles up ON up.user_id = tm.user_id
       LEFT JOIN friendship_streaks fs
         ON fs.user_low_id = LEAST(tm.user_id, ?)
        AND fs.user_high_id = GREATEST(tm.user_id, ?)
       WHERE tm.tribe_id = ? AND tm.state = 'member'
       ORDER BY
         CASE WHEN tm.user_id = ? THEN 0 ELSE 1 END ASC,
         tm.joined_at DESC,
         tm.created_at DESC`,
      [viewerId, viewerId, tribeId, viewerId],
    );
    return rows.map((row) => {
      const userId = String(row.userId);
      const fullName = String(row.fullName || '').trim();
      const username = String(row.username || '').trim();
      return localizeMockNameFields({
        userId,
        name: fullName || username || 'User',
        username,
        avatarUrl: String(row.avatarUrl || '').trim(),
        streakCount: Number(row.streakCount) || 0,
        isMe: userId === viewerId,
        joinedAt: row.joinedAt || null,
      });
    });
  }

  /**
   * Single tribe detail for group chat / group info. Creates the group
   * conversation on demand when the viewer is already a member.
   */
  async getForUser(userId, tribeId) {
    const tribe = await this.findById(tribeId);
    if (!tribe || tribe.status === 'dormant') {
      return { ok: false, reason: 'not_found' };
    }

    const membership = await this.membershipMap(userId);
    const existing = membership.get(String(tribe.id));
    if (existing?.state === 'member') {
      const conversationId = await this.ensureConversation(tribe.id);
      await this.syncConversationMembers(tribe.id, conversationId);
    }

    const [fresh, bestStreak, membersInfo, memberList] = await Promise.all([
      this.findById(tribe.id),
      this.bestStreak(userId),
      this.membersByTribeIds([tribe.id]),
      this.listMembers(tribe.id, userId),
    ]);
    const item = this._resolve(
      fresh,
      bestStreak,
      {
        ...(membership.get(String(tribe.id)) || {}),
        userId,
      },
      membersInfo.get(String(tribe.id)),
    );
    item.memberCount = memberList.length;
    item.members = memberList;
    const ownerId = await this._resolveOwnerUserId(fresh);
    item.ownerUserId = ownerId;
    item.isOwner = ownerId !== '' && ownerId === String(userId);
    return { ok: true, tribe: item };
  }

  /**
   * Opt-in join. Allowed when the tribe is a featured invitation, or the
   * user's streak already crossed the threshold. Idempotent.
   * @returns {Promise<{ ok: boolean, reason?: string, tribe?: object }>}
   */
  async join(userId, tribeId) {
    const tribe = await this.findById(tribeId);
    if (!tribe || tribe.status === 'dormant') {
      return { ok: false, reason: 'not_found' };
    }

    const bestStreak = await this.bestStreak(userId);
    const threshold = Number(tribe.threshold) || 10;
    const membership = await this.membershipMap(userId);
    const existing = membership.get(String(tribe.id));
    const alreadyMember = existing?.state === 'member';
    const eligible = alreadyMember || bestStreak >= threshold;

    if (!eligible) {
      return { ok: false, reason: 'not_eligible' };
    }

    await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO tribe_members
           (tribe_id, user_id, state, progress, joined_at, unlocked_at, last_progress_at)
         VALUES (?, ?, 'member', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           state = 'member',
           progress = VALUES(progress),
           joined_at = COALESCE(joined_at, VALUES(joined_at)),
           unlocked_at = COALESCE(unlocked_at, VALUES(unlocked_at))`,
        [tribe.id, userId, threshold],
      );
      // affectedRows: 1 = fresh insert, 2 = updated existing row. Only bump the
      // cached member count when this user was not already a member.
      const becameMember = result.affectedRows === 1;
      if (becameMember) {
        await conn.execute(
          `UPDATE tribes
           SET member_count_cache = member_count_cache + 1
           WHERE id = ?`,
          [tribe.id],
        );
      }
    });

    const conversationId = await this.ensureConversation(tribe.id);
    await this.syncConversationMembers(tribe.id, conversationId);

    const [fresh, members, memberList] = await Promise.all([
      this.findById(tribe.id),
      this.membersByTribeIds([tribe.id]),
      this.listMembers(tribe.id, userId),
    ]);
    const item = this._resolve(
      fresh,
      bestStreak,
      { state: 'member', progress: threshold, userId },
      members.get(String(tribe.id)),
    );
    item.memberCount = memberList.length;
    item.members = memberList;
    item.conversationId = conversationId || item.conversationId;
    return { ok: true, tribe: item };
  }

  /**
   * Opt-out leave. Downgrades member → eligible (streak progress stays so they
   * can rejoin). Idempotent if the user is not currently a member.
   * @returns {Promise<{ ok: boolean, reason?: string, tribe?: object }>}
   */
  async leave(userId, tribeId) {
    const tribe = await this.findById(tribeId);
    if (!tribe || tribe.status === 'dormant') {
      return { ok: false, reason: 'not_found' };
    }

    const membership = await this.membershipMap(userId);
    const existing = membership.get(String(tribe.id));

    if (existing?.state === 'member') {
      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE tribe_members
           SET state = 'eligible', joined_at = NULL
           WHERE tribe_id = ? AND user_id = ? AND state = 'member'`,
          [tribe.id, userId],
        );
        if (tribe.conversation_id) {
          await conn.execute(
            `UPDATE conversation_members
             SET deleted_at = CURRENT_TIMESTAMP(3)
             WHERE conversation_id = ? AND user_id = ? AND deleted_at IS NULL`,
            [tribe.conversation_id, userId],
          );
        }
        await conn.execute(
          `UPDATE tribes t
           SET member_count_cache = (
             SELECT COUNT(*) FROM tribe_members m
             WHERE m.tribe_id = t.id AND m.state = 'member'
           )
           WHERE t.id = ?`,
          [tribe.id],
        );
      });
    }

    const [fresh, bestStreak, members] = await Promise.all([
      this.findById(tribe.id),
      this.bestStreak(userId),
      this.membersByTribeIds([tribe.id]),
    ]);
    const item = this._resolve(
      fresh,
      bestStreak,
      { state: 'eligible', progress: existing?.progress || 0, userId },
      members.get(String(tribe.id)),
    );
    return { ok: true, tribe: item };
  }

  async getByConversationId(conversationId) {
    const id = String(conversationId || '').trim();
    if (!id) return null;
    const rows = await query(
      `SELECT id, name, emoji FROM tribes WHERE conversation_id = ? LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  /**
   * User-created group. Costs coins atomically with tribe + conversation setup.
   * @returns {Promise<{ ok: boolean, reason?: string, tribe?: object, coinsBalance?: number }>}
   */
  async createManual(userId, { name, coinCost = MANUAL_TRIBE_COIN_COST } = {}) {
    const safeName = String(name || '').trim().slice(0, 160);
    if (!safeName) {
      return { ok: false, reason: 'invalid_name' };
    }

    const cost = Number(coinCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      return { ok: false, reason: 'invalid_coin_cost' };
    }

    const tribeId = randomUUID();
    const conversationId = randomUUID();
    const areaKey = `custom-${tribeId}`;
    const category = 'other';
    const threshold = 10;

    const profileRows = await query(
      `SELECT location_text AS locationText
       FROM user_profiles
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    );
    const areaLabel = String(profileRows[0]?.locationText || '')
      .trim()
      .slice(0, 120);

    let coinsBalance = 0;

    try {
      await withTransaction(async (conn) => {
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
          err.status = 402;
          err.code = 'INSUFFICIENT_COINS';
          throw err;
        }

        coinsBalance = balance - cost;
        await conn.execute(
          `INSERT INTO coin_transactions
             (id, user_id, delta, reason, source_type, source_id, balance_after)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            userId,
            -cost,
            'spend_group',
            'tribe',
            tribeId,
            coinsBalance,
          ],
        );
        await conn.execute(
          `UPDATE user_profiles SET coins = ? WHERE user_id = ?`,
          [coinsBalance, userId],
        );

        await conn.execute(`INSERT INTO conversations (id) VALUES (?)`, [
          conversationId,
        ]);
        await conn.execute(
          `INSERT INTO tribes (
             id, category, area_key, area_label, name, description, emoji,
             cadence_label, threshold, min_members, member_count_cache,
             status, is_featured, conversation_id, sort_order
             , owner_user_id
           ) VALUES (?, ?, ?, ?, ?, '', '✨', '', ?, 1, 1, 'active', 0, ?, 9000, ?)`,
          [
            tribeId,
            category,
            areaKey,
            areaLabel || null,
            safeName,
            threshold,
            conversationId,
            userId,
          ],
        );
        await conn.execute(
          `INSERT INTO tribe_members
             (tribe_id, user_id, state, progress, joined_at, unlocked_at, last_progress_at)
           VALUES (?, ?, 'member', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
          [tribeId, userId, threshold],
        );
        await conn.execute(
          `INSERT INTO conversation_members
             (conversation_id, user_id, folder, unread_count, deleted_at)
           VALUES (?, ?, 'inbox', 0, NULL)
           ON DUPLICATE KEY UPDATE
             folder = 'inbox',
             deleted_at = NULL`,
          [conversationId, userId],
        );
      });
    } catch (err) {
      if (err.code === 'INSUFFICIENT_COINS') {
        return { ok: false, reason: 'insufficient_coins' };
      }
      throw err;
    }

    const [fresh, streakDays, members, memberList] = await Promise.all([
      this.findById(tribeId),
      this.categoryProgress(userId),
      this.membersByTribeIds([tribeId]),
      this.listMembers(tribeId, userId),
    ]);
    const item = this._resolve(
      fresh,
      streakDays,
      { state: 'member', progress: threshold, userId },
      members.get(String(tribeId)),
    );
    item.memberCount = memberList.length;
    item.members = memberList;
    item.conversationId = conversationId;
    item.ownerUserId = String(userId);
    item.isOwner = true;
    return { ok: true, tribe: item, coinsBalance };
  }

  async _resolveOwnerUserId(tribe) {
    const stored = String(tribe.owner_user_id || '').trim();
    if (stored) return stored;
    if (!String(tribe.area_key || '').startsWith('custom-')) return '';
    const rows = await query(
      `SELECT user_id AS userId
       FROM tribe_members
       WHERE tribe_id = ? AND state = 'member'
       ORDER BY joined_at ASC, created_at ASC
       LIMIT 1`,
      [tribe.id],
    );
    return String(rows[0]?.userId || '').trim();
  }

  async updatePhoto(userId, tribeId, { photoUrl }) {
    const id = String(tribeId || '').trim();
    const url = String(photoUrl || '').trim();
    if (!id) return { ok: false, reason: 'not_found' };
    if (!url) return { ok: false, reason: 'invalid_photo' };

    const tribe = await this.findById(id);
    if (!tribe || tribe.status === 'dormant') {
      return { ok: false, reason: 'not_found' };
    }
    const owner = await this._resolveOwnerUserId(tribe);
    if (!owner || owner !== String(userId || '').trim()) {
      return { ok: false, reason: 'forbidden' };
    }
    if (!String(tribe.owner_user_id || '').trim()) {
      await query(`UPDATE tribes SET owner_user_id = ? WHERE id = ?`, [
        owner,
        id,
      ]);
    }

    await query(`UPDATE tribes SET photo_url = ? WHERE id = ?`, [url, id]);
    const [fresh, streakDays, membership, members, memberList] = await Promise.all([
      this.findById(id),
      this.categoryProgress(userId),
      this.membershipMap(userId),
      this.membersByTribeIds([id]),
      this.listMembers(id, userId),
    ]);
    const item = this._resolve(
      fresh,
      streakDays,
      {
        ...(membership.get(String(id)) || { state: 'member', progress: 10 }),
        userId,
      },
      members.get(String(id)),
    );
    item.memberCount = memberList.length;
    item.members = memberList;
    return { ok: true, tribe: item };
  }

  /**
   * Owner-only hard delete for user-created groups.
   * Deletes tribe and its conversation/messages atomically.
   */
  async deleteByOwner(userId, tribeId) {
    const id = String(tribeId || '').trim();
    if (!id) return { ok: false, reason: 'not_found' };
    const tribe = await this.findById(id);
    if (!tribe || tribe.status === 'dormant') {
      return { ok: false, reason: 'not_found' };
    }
    if (!String(tribe.area_key || '').startsWith('custom-')) {
      return { ok: false, reason: 'forbidden' };
    }
    const owner = await this._resolveOwnerUserId(tribe);
    if (!owner || owner !== String(userId || '').trim()) {
      return { ok: false, reason: 'forbidden' };
    }

    await withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT id, conversation_id AS conversationId, owner_user_id AS ownerUserId, area_key AS areaKey
         FROM tribes
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [id],
      );
      const locked = rows?.[0];
      if (!locked) return;
      if (!String(locked.areaKey || '').startsWith('custom-')) {
        const err = new Error('Forbidden');
        err.code = 'FORBIDDEN';
        throw err;
      }
      const lockedOwner = String(locked.ownerUserId || '').trim() || owner;
      if (lockedOwner !== String(userId || '').trim()) {
        const err = new Error('Forbidden');
        err.code = 'FORBIDDEN';
        throw err;
      }

      await conn.execute(`DELETE FROM tribes WHERE id = ?`, [id]);
      const conversationId = String(locked.conversationId || '').trim();
      if (conversationId) {
        await conn.execute(`DELETE FROM conversations WHERE id = ?`, [conversationId]);
      }
    });

    return { ok: true };
  }
}

module.exports = {
  TribeRepository,
  normalizeCategory,
  MANUAL_TRIBE_COIN_COST,
};