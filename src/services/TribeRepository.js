'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/database');
const {
  DISTRICTS,
  districtForCoords,
  haversineKm,
} = require('../utils/istanbulDistricts');
const { normalizeCheckInCategory } = require('./CheckInService');

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
   * Real member counts and up to 3 member avatars per tribe, straight from
   * tribe_members joined to user_profiles. This is the source of truth for
   * "N üye" and the avatar pile -- no cached/seeded numbers.
   * @returns {Promise<Map<string, { count: number, avatars: string[] }>>}
   */
  async membersByTribe() {
    const rows = await query(
      `SELECT tm.tribe_id, up.avatar_url
       FROM tribe_members tm
       INNER JOIN user_profiles up ON up.user_id = tm.user_id
       WHERE tm.state = 'member'
       ORDER BY tm.joined_at DESC, tm.created_at DESC`,
    );
    const map = new Map();
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

  _resolve(tribe, streakDays, membership, memberInfo) {
    const category = normalizeCategory(tribe.category);
    const threshold = Number(tribe.threshold) || 10;
    const isFeatured = Boolean(tribe.is_featured);
    const isMember = membership?.state === 'member';
    // Progress prefers the district-accurate value stored by formation; falls
    // back to the category streak so a fresh check-in still shows movement
    // before the nightly pass records it.
    const days = Number(streakDays.get(category) || 0);
    const stored = membership?.progress != null ? Number(membership.progress) : 0;
    const progress = isMember ? threshold : Math.min(Math.max(stored, days), threshold);
    const unlocked = isMember || isFeatured || progress >= threshold;

    let state = 'locked';
    if (isMember) state = 'member';
    else if (unlocked) state = 'unlocked';

    return {
      id: tribe.id,
      category,
      areaKey: tribe.area_key,
      areaLabel: tribe.area_label || '',
      name: tribe.name,
      description: tribe.description || '',
      emoji: tribe.emoji || CATEGORY_EMOJI[category],
      cadenceLabel: tribe.cadence_label || '',
      threshold,
      progress,
      progressLabel: `${progress}/${threshold}`,
      remaining: Math.max(threshold - progress, 0),
      state,
      isFeatured,
      memberCount: memberInfo?.count || 0,
      avatars: memberInfo?.avatars || [],
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
   * Everything the Tribe screen needs, bucketed for the client:
   *   featured -> invitation cards (carousel)
   *   tribes   -> the list below, ranked by proximity to the user's district
   *
   * Always returns the full active catalogue, so the screen is never empty for
   * any user -- far-away users just fall back to city-wide ordering.
   */
  async listForUser(userId, { lat, lng } = {}) {
    const [tribeRows, streakDays, membership, members, context] =
      await Promise.all([
        query(
          `SELECT * FROM tribes
           WHERE status = 'active'
           ORDER BY sort_order ASC, created_at ASC`,
        ),
        this.categoryProgress(userId),
        this.membershipMap(userId),
        this.membersByTribe(),
        this.resolveUserContext(userId, lat, lng),
      ]);

    const featured = [];
    const tribes = [];
    for (const row of tribeRows) {
      const item = this._resolve(
        row,
        streakDays,
        membership.get(String(row.id)),
        members.get(String(row.id)),
      );
      item._distanceKm = this._rankDistanceKm(row.area_key, context);
      // Unlocked-but-not-joined tribes are the algorithm's open invitations.
      if (item.state === 'unlocked') featured.push(item);
      else tribes.push(item);
    }

    // Nearby first; joined members bubble up; then bigger tribes.
    tribes.sort((a, b) => {
      if (a.state !== b.state) {
        if (a.state === 'member') return -1;
        if (b.state === 'member') return 1;
      }
      if (a._distanceKm !== b._distanceKm) return a._distanceKm - b._distanceKm;
      return b.memberCount - a.memberCount;
    });

    const strip = ({ _distanceKm, ...rest }) => rest;
    return { featured: featured.map(strip), tribes: tribes.map(strip) };
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
      return {
        userId,
        name: fullName || username || 'User',
        username,
        avatarUrl: String(row.avatarUrl || '').trim(),
        streakCount: Number(row.streakCount) || 0,
        isMe: userId === viewerId,
        joinedAt: row.joinedAt || null,
      };
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

    const [fresh, streakDays, membersInfo, memberList] = await Promise.all([
      this.findById(tribe.id),
      this.categoryProgress(userId),
      this.membersByTribe(),
      this.listMembers(tribe.id, userId),
    ]);
    const item = this._resolve(
      fresh,
      streakDays,
      membership.get(String(tribe.id)),
      membersInfo.get(String(tribe.id)),
    );
    item.memberCount = memberList.length;
    item.members = memberList;
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

    const streakDays = await this.categoryProgress(userId);
    const category = normalizeCategory(tribe.category);
    const threshold = Number(tribe.threshold) || 10;
    const membership = await this.membershipMap(userId);
    const existing = membership.get(String(tribe.id));
    const alreadyMember = existing?.state === 'member';
    const eligible =
      alreadyMember ||
      Boolean(tribe.is_featured) ||
      Number(streakDays.get(category) || 0) >= threshold;

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
      this.membersByTribe(),
      this.listMembers(tribe.id, userId),
    ]);
    const item = this._resolve(
      fresh,
      streakDays,
      { state: 'member', progress: threshold },
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

    const [fresh, streakDays, members] = await Promise.all([
      this.findById(tribe.id),
      this.categoryProgress(userId),
      this.membersByTribe(),
    ]);
    const item = this._resolve(
      fresh,
      streakDays,
      { state: 'eligible', progress: existing?.progress || 0 },
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
}

module.exports = { TribeRepository, normalizeCategory };
