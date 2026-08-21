'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../config/database');
const {
  User,
  UserProfile,
  OAuthIdentity,
  UserOnboardingFlags,
  UserSettings,
  ProfileLink,
} = require('../models');
const { localizedMockName, isMockUserId } = require('../utils/mockNameI18n');
const { getRequestLocale } = require('../utils/requestContext');

class UserRepository {
  async findByFirebaseUid(firebaseUid, { includeDeleted = false } = {}) {
    const deletedClause = includeDeleted ? '' : ' AND deleted_at IS NULL';
    const rows = await query(
      `SELECT * FROM users WHERE firebase_uid = ?${deletedClause} LIMIT 1`,
      [firebaseUid],
    );
    return User.fromRow(rows[0]);
  }

  async findByPhoneE164(phoneE164, { includeDeleted = false } = {}) {
    if (!phoneE164) return null;
    const deletedClause = includeDeleted ? '' : ' AND deleted_at IS NULL';
    const rows = await query(
      `SELECT * FROM users WHERE phone_e164 = ?${deletedClause} LIMIT 1`,
      [phoneE164],
    );
    return User.fromRow(rows[0]);
  }

  async findByEmail(email, { includeDeleted = false } = {}) {
    if (!email) return null;
    const deletedClause = includeDeleted ? '' : ' AND deleted_at IS NULL';
    const rows = await query(
      `SELECT * FROM users WHERE email = ?${deletedClause} LIMIT 1`,
      [email],
    );
    return User.fromRow(rows[0]);
  }

  async findById(id) {
    const rows = await query(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id],
    );
    return User.fromRow(rows[0]);
  }

  isDuplicateKey(err) {
    return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
  }

  /**
   * Same person, new Firebase UID (or restored account): keep MySQL user id.
   */
  async relinkFirebaseIdentity(
    userId,
    {
      firebaseUid,
      phoneE164,
      email,
      primaryAuth,
      phoneVerifiedAt,
      emailVerifiedAt,
    },
  ) {
    await query(
      `UPDATE users
       SET firebase_uid = CONCAT('deleted:', id)
       WHERE firebase_uid = ?
         AND id <> ?
         AND deleted_at IS NOT NULL`,
      [firebaseUid, userId],
    );

    await query(
      `UPDATE users SET
         firebase_uid = ?,
         phone_e164 = COALESCE(?, phone_e164),
         email = COALESCE(?, email),
         primary_auth = COALESCE(?, primary_auth),
         phone_verified_at = COALESCE(?, phone_verified_at),
         email_verified_at = COALESCE(?, email_verified_at),
         status = 'active',
         deleted_at = NULL,
         last_login_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [
        firebaseUid,
        phoneE164 || null,
        email || null,
        primaryAuth || null,
        phoneVerifiedAt || null,
        emailVerifiedAt || null,
        userId,
      ],
    );
    return this.findById(userId);
  }

  async create({
    firebaseUid,
    phoneE164,
    email,
    primaryAuth,
    phoneVerifiedAt,
    emailVerifiedAt,
  }) {
    const id = randomUUID();
    await query(
      `INSERT INTO users (
        id, firebase_uid, phone_e164, email, primary_auth,
        phone_verified_at, email_verified_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [
        id,
        firebaseUid,
        phoneE164 || null,
        email || null,
        primaryAuth,
        phoneVerifiedAt || null,
        emailVerifiedAt || null,
      ],
    );
    return this.findById(id);
  }

  async touchLogin(userId) {
    await query(
      'UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [userId],
    );
  }

  async getProfile(userId) {
    const rows = await query(
      'SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return UserProfile.fromRow(rows[0]);
  }

  async findProfileByUsername(username) {
    const rows = await query(
      `SELECT up.*
       FROM user_profiles up
       INNER JOIN users u ON u.id = up.user_id AND u.deleted_at IS NULL
       WHERE LOWER(up.username) = ?
       LIMIT 1`,
      [username],
    );
    return UserProfile.fromRow(rows[0]);
  }

  async areFriends(userA, userB) {
    if (!userA || !userB || userA === userB) return false;
    const [low, high] = userA < userB ? [userA, userB] : [userB, userA];
    const rows = await query(
      `SELECT id FROM friendships
       WHERE user_low_id = ? AND user_high_id = ?
       LIMIT 1`,
      [low, high],
    );
    return Boolean(rows[0]);
  }

  async isBlockedEitherWay(userA, userB) {
    if (!userA || !userB || userA === userB) return false;
    const rows = await query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?)
       LIMIT 1`,
      [userA, userB, userB, userA],
    );
    return Boolean(rows[0]);
  }

  /** True when [blockerId] has blocked [blockedId] (one direction). */
  async isBlockedBy(blockerId, blockedId) {
    if (!blockerId || !blockedId || blockerId === blockedId) return false;
    const rows = await query(
      `SELECT 1 FROM blocks
       WHERE blocker_id = ? AND blocked_id = ?
       LIMIT 1`,
      [blockerId, blockedId],
    );
    return Boolean(rows[0]);
  }

  async ensureProfile(userId) {
    await query(
      `INSERT IGNORE INTO user_profiles (user_id, full_name)
       VALUES (?, '')`,
      [userId],
    );
    return this.getProfile(userId);
  }

  async ensureOnboardingFlags(userId) {
    await query(
      `INSERT IGNORE INTO user_onboarding_flags (user_id) VALUES (?)`,
      [userId],
    );
    const rows = await query(
      'SELECT * FROM user_onboarding_flags WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return UserOnboardingFlags.fromRow(rows[0]);
  }

  async ensureSettings(userId, preferredLanguage = 'en') {
    await query(
      `INSERT IGNORE INTO user_settings (user_id, preferred_language) VALUES (?, ?)`,
      [userId, preferredLanguage],
    );
    const rows = await query(
      'SELECT * FROM user_settings WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return UserSettings.fromRow(rows[0]);
  }

  async upsertOAuthIdentity({ userId, provider, subject, email, rawProfile }) {
    const existing = await query(
      'SELECT * FROM oauth_identities WHERE provider = ? AND subject = ? LIMIT 1',
      [provider, subject],
    );
    if (existing[0]) {
      await query(
        `UPDATE oauth_identities
         SET email = COALESCE(?, email), raw_profile = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [email || null, rawProfile ? JSON.stringify(rawProfile) : null, existing[0].id],
      );
      return OAuthIdentity.fromRow(
        (
          await query('SELECT * FROM oauth_identities WHERE id = ? LIMIT 1', [
            existing[0].id,
          ])
        )[0],
      );
    }

    const id = randomUUID();
    await query(
      `INSERT INTO oauth_identities (id, user_id, provider, subject, email, raw_profile)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        provider,
        subject,
        email || null,
        rawProfile ? JSON.stringify(rawProfile) : null,
      ],
    );
    const rows = await query(
      'SELECT * FROM oauth_identities WHERE id = ? LIMIT 1',
      [id],
    );
    return OAuthIdentity.fromRow(rows[0]);
  }

  async updatePreferredLanguage(userId, preferredLanguage = 'en') {
    const { normalizeLocale } = require('../utils/mockNameI18n');
    const lang = normalizeLocale(preferredLanguage);
    await this.ensureSettings(userId, lang);
    await query(
      `UPDATE user_settings
       SET preferred_language = ?
       WHERE user_id = ?`,
      [lang, userId],
    );
    return lang;
  }

  async updateProfile(
    userId,
    { fullName, username, birthDate, bio, locationText, accountPrivacy, preferredLanguage },
  ) {
    await withTransaction(async (conn) => {
      if (username !== undefined && username !== null && username !== '') {
        await conn.execute('DELETE FROM usernames WHERE user_id = ?', [userId]);
        await conn.execute(
          'INSERT INTO usernames (username, user_id) VALUES (?, ?)',
          [username, userId],
        );
      }

      await conn.execute(
        `UPDATE user_profiles SET
          full_name = COALESCE(?, full_name),
          username = COALESCE(?, username),
          birth_date = COALESCE(?, birth_date),
          bio = COALESCE(?, bio),
          location_text = COALESCE(?, location_text),
          account_privacy = COALESCE(?, account_privacy)
         WHERE user_id = ?`,
        [
          fullName ?? null,
          username ?? null,
          birthDate ?? null,
          bio !== undefined ? bio : null,
          locationText ?? null,
          accountPrivacy ?? null,
          userId,
        ],
      );
    });

    if (preferredLanguage !== undefined && preferredLanguage !== null) {
      await this.updatePreferredLanguage(userId, preferredLanguage);
    }

    return this.getProfile(userId);
  }

  async updateAvatar(userId, { avatarUrl, avatarStorageKey }) {
    await query(
      `UPDATE user_profiles SET
        avatar_url = ?,
        avatar_storage_key = ?
       WHERE user_id = ?`,
      [avatarUrl, avatarStorageKey, userId],
    );
    return this.getProfile(userId);
  }

  async listProfileLinks(userId) {
    const rows = await query(
      `SELECT * FROM profile_links
       WHERE user_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );
    return rows.map((row) => ProfileLink.fromRow(row));
  }

  /**
   * Replace all profile links for a user.
   * @param {string} userId
   * @param {Array<{ title: string, url: string }>} links
   */
  async replaceProfileLinks(userId, links) {
    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM profile_links WHERE user_id = ?', [userId]);
      for (let i = 0; i < links.length; i += 1) {
        const link = links[i];
        await conn.execute(
          `INSERT INTO profile_links (id, user_id, title, url, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), userId, link.title, link.url, i],
        );
      }
    });
    return this.listProfileLinks(userId);
  }

  async listUserStickers(userId) {
    return query(
      `SELECT id, title, image_url, source, created_at
       FROM user_stickers
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId],
    );
  }

  async listBlockedUsers(userId) {
    return query(
      `SELECT
         b.blocked_id AS user_id,
         COALESCE(up.username, '') AS username,
         COALESCE(up.avatar_url, '') AS avatar_url,
         b.created_at
       FROM blocks b
       LEFT JOIN user_profiles up ON up.user_id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`,
      [userId],
    );
  }

  async blockUser(blockerId, blockedId, { reason = null } = {}) {
    if (!blockerId || !blockedId || blockerId === blockedId) return false;
    await query(
      `INSERT INTO blocks (blocker_id, blocked_id, reason)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [blockerId, blockedId, reason],
    );
    return true;
  }

  async unblockUser(blockerId, blockedId) {
    const result = await query(
      `DELETE FROM blocks
       WHERE blocker_id = ? AND blocked_id = ?`,
      [blockerId, blockedId],
    );
    return (result?.affectedRows ?? 0) > 0;
  }

  async restrictUser(restrictorId, restrictedId) {
    if (!restrictorId || !restrictedId || restrictorId === restrictedId) {
      return false;
    }
    await query(
      `INSERT INTO restrictions (restrictor_id, restricted_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [restrictorId, restrictedId],
    );
    return true;
  }

  async unrestrictUser(restrictorId, restrictedId) {
    const result = await query(
      `DELETE FROM restrictions
       WHERE restrictor_id = ? AND restricted_id = ?`,
      [restrictorId, restrictedId],
    );
    return (result?.affectedRows ?? 0) > 0;
  }

  async isRestrictedBy(restrictorId, restrictedId) {
    if (!restrictorId || !restrictedId || restrictorId === restrictedId) {
      return false;
    }
    const rows = await query(
      `SELECT 1 FROM restrictions
       WHERE restrictor_id = ? AND restricted_id = ?
       LIMIT 1`,
      [restrictorId, restrictedId],
    );
    return Boolean(rows[0]);
  }

  /** Set of user ids that [restrictorId] has restricted. */
  async listRestrictedIds(restrictorId) {
    if (!restrictorId) return new Set();
    const rows = await query(
      `SELECT restricted_id FROM restrictions WHERE restrictor_id = ?`,
      [restrictorId],
    );
    return new Set(rows.map((r) => r.restricted_id));
  }

  async listRestrictedUsers(userId) {
    return query(
      `SELECT
         r.restricted_id AS user_id,
         COALESCE(up.username, '') AS username,
         COALESCE(up.avatar_url, '') AS avatar_url,
         r.created_at
       FROM restrictions r
       LEFT JOIN user_profiles up ON up.user_id = r.restricted_id
       WHERE r.restrictor_id = ?
       ORDER BY r.created_at DESC`,
      [userId],
    );
  }

  async createUserSticker(userId, { title, imageUrl, source = 'generated' }) {
    const id = randomUUID();
    await query(
      `INSERT INTO user_stickers (id, user_id, title, image_url, source)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, title || null, imageUrl, source],
    );
    const rows = await query(
      `SELECT id, title, image_url, source, created_at
       FROM user_stickers
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  async getCoinBalance(userId) {
    const rows = await query(
      `SELECT coins FROM user_profiles WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    return Number(rows[0]?.coins || 0);
  }

  async spendCoins(userId, { amount, reason, sourceType = null, sourceId = null }) {
    const cost = Number(amount);
    if (!Number.isFinite(cost) || cost <= 0) {
      const err = new Error('Invalid coin amount');
      err.status = 400;
      err.code = 'INVALID_COIN_AMOUNT';
      throw err;
    }

    return withTransaction(async (conn) => {
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

      const nextBalance = balance - cost;
      await conn.execute(
        `INSERT INTO coin_transactions
           (id, user_id, delta, reason, source_type, source_id, balance_after)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          userId,
          -cost,
          reason,
          sourceType,
          sourceId,
          nextBalance,
        ],
      );
      await conn.execute(
        `UPDATE user_profiles SET coins = ? WHERE user_id = ?`,
        [nextBalance, userId],
      );
      return nextBalance;
    });
  }

  async createPlan(userId, {
    placeName,
    subtitle = null,
    category = null,
    scheduledAt,
    note = null,
    showToFriends = true,
    showToNearby = false,
  }) {
    const id = randomUUID();
    await query(
      `INSERT INTO plans (
         id, user_id, place_name, subtitle, category, scheduled_at,
         note, show_to_friends, show_to_nearby, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        id,
        userId,
        placeName,
        subtitle || null,
        category || null,
        scheduledAt,
        note || null,
        showToFriends ? 1 : 0,
        showToNearby ? 1 : 0,
      ],
    );
    const rows = await query(
      `SELECT
         id, user_id, place_name, subtitle, category, scheduled_at,
         note, show_to_friends, show_to_nearby, status, created_at, updated_at
       FROM plans
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  async listTodayPlans(userId, { from, to } = {}) {
    return query(
      `SELECT
         id, user_id, place_name, subtitle, category, scheduled_at,
         note, show_to_friends, show_to_nearby, status, created_at, updated_at
       FROM plans
       WHERE user_id = ?
         AND status = 'scheduled'
         AND scheduled_at >= ?
         AND scheduled_at < ?
       ORDER BY scheduled_at ASC`,
      [userId, from, to],
    );
  }

  /**
   * Friends (accounts the viewer follows) with a visible plan today,
   * grouped by place name for "X friends are joining".
   */
  async listFriendJoiningByPlace(userId, { from, to } = {}) {
    if (!userId || !from || !to) return [];
    const rows = await query(
      `SELECT
         p.place_name AS place_name,
         up.user_id AS user_id,
         up.username AS username,
         up.avatar_url AS avatar_url
       FROM plans p
       INNER JOIN follows f
         ON f.follower_id = ?
        AND f.following_id = p.user_id
       INNER JOIN user_profiles up ON up.user_id = p.user_id
       INNER JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
       WHERE p.status = 'scheduled'
         AND p.show_to_friends = 1
         AND p.user_id <> ?
         AND p.scheduled_at >= ?
         AND p.scheduled_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id)
              OR (b.blocker_id = p.user_id AND b.blocked_id = ?)
         )
       ORDER BY p.scheduled_at ASC`,
      [userId, userId, from, to, userId, userId],
    );

    const byPlace = new Map();
    for (const row of rows) {
      const placeName = String(row.place_name || '').trim();
      if (!placeName) continue;
      const key = placeName.toLowerCase().replace(/\s+/g, ' ');
      let bucket = byPlace.get(key);
      if (!bucket) {
        bucket = { placeName, friendIds: new Set(), friends: [] };
        byPlace.set(key, bucket);
      }
      if (bucket.friendIds.has(row.user_id)) continue;
      bucket.friendIds.add(row.user_id);
      if (bucket.friends.length >= 20) continue;
      bucket.friends.push({
        userId: row.user_id,
        username: String(row.username || '').trim(),
        avatarUrl: String(row.avatar_url || '').trim(),
      });
    }

    return [...byPlace.values()].map((bucket) => ({
      placeName: bucket.placeName,
      friendsCount: bucket.friendIds.size,
      friends: bucket.friends,
    }));
  }

  /**
   * Plans visible to a viewer on someone else's profile.
   * Self → all scheduled. Viewer follows owner → show_to_friends. Else → none.
   */
  async listTodayPlansForViewer(
    ownerUserId,
    viewerUserId,
    { from, to, isSelf = false, viewerFollows = false } = {},
  ) {
    if (!isSelf && !viewerFollows) return [];
    const rows = await this.listTodayPlans(ownerUserId, { from, to });
    if (isSelf) return rows;
    return rows.filter((row) => Boolean(row.show_to_friends));
  }

  async viewerFollows(viewerId, ownerId) {
    if (!viewerId || !ownerId) return false;
    if (viewerId === ownerId) return true;
    const rows = await query(
      `SELECT 1 FROM follows
       WHERE follower_id = ? AND following_id = ?
       LIMIT 1`,
      [viewerId, ownerId],
    );
    return Boolean(rows[0]);
  }

  async recordProfileView(ownerUserId, viewerUserId) {
    const ownerId = String(ownerUserId || '').trim();
    const viewerId = String(viewerUserId || '').trim();
    if (!ownerId || !viewerId || ownerId === viewerId) return;
    await query(
      `INSERT INTO profile_views (
         owner_user_id, viewer_user_id, view_count, first_viewed_at, last_viewed_at
       )
       VALUES (?, ?, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         view_count = view_count + 1,
         last_viewed_at = CURRENT_TIMESTAMP(3)`,
      [ownerId, viewerId],
    );
  }

  async listProfileViewers(ownerUserId, { limit = 50, offset = 0 } = {}) {
    const ownerId = String(ownerUserId || '').trim();
    if (!ownerId) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = await query(
      `SELECT
         pv.viewer_user_id AS user_id,
         COALESCE(up.username, '') AS username,
         COALESCE(up.full_name, '') AS full_name,
         COALESCE(up.avatar_url, '') AS avatar_url,
         pv.view_count AS view_count,
         pv.last_viewed_at AS last_viewed_at,
         IF(pvr.viewer_user_id IS NOT NULL, 1, 0) AS revealed
       FROM profile_views pv
       INNER JOIN users u ON u.id = pv.viewer_user_id AND u.deleted_at IS NULL
       LEFT JOIN user_profiles up ON up.user_id = pv.viewer_user_id
       LEFT JOIN profile_view_reveals pvr
         ON pvr.owner_user_id = pv.owner_user_id AND pvr.viewer_user_id = pv.viewer_user_id
       LEFT JOIN blocks b1
         ON b1.blocker_id = ? AND b1.blocked_id = pv.viewer_user_id
       LEFT JOIN blocks b2
         ON b2.blocker_id = pv.viewer_user_id AND b2.blocked_id = ?
       WHERE pv.owner_user_id = ?
         AND b1.blocked_id IS NULL
         AND b2.blocker_id IS NULL
       ORDER BY pv.last_viewed_at DESC
       LIMIT ? OFFSET ?`,
      [ownerId, ownerId, ownerId, safeLimit, safeOffset],
    );
    const locale = getRequestLocale();
    return rows.map((row) => {
      if (isMockUserId(row.user_id)) {
        row.full_name = localizedMockName(row.user_id, locale) || row.full_name;
      }
      return row;
    });
  }

  async revealProfileViewer(ownerUserId, viewerUserId) {
    const ownerId = String(ownerUserId || '').trim();
    const viewerId = String(viewerUserId || '').trim();
    if (!ownerId || !viewerId) throw new Error('Missing user ids');

    const existing = await query(
      `SELECT 1 FROM profile_view_reveals WHERE owner_user_id = ? AND viewer_user_id = ? LIMIT 1`,
      [ownerId, viewerId],
    );
    if (existing[0]) return { alreadyRevealed: true };

    const viewer = await query(
      `SELECT 1 FROM profile_views WHERE owner_user_id = ? AND viewer_user_id = ? LIMIT 1`,
      [ownerId, viewerId],
    );
    if (!viewer[0]) throw new Error('Viewer not found');

    await query(
      `INSERT INTO profile_view_reveals (owner_user_id, viewer_user_id) VALUES (?, ?)`,
      [ownerId, viewerId],
    );
    return { alreadyRevealed: false };
  }

  async revealAllProfileViewers(ownerUserId) {
    const ownerId = String(ownerUserId || '').trim();
    if (!ownerId) throw new Error('Missing owner id');

    const unrevealed = await query(
      `SELECT pv.viewer_user_id
       FROM profile_views pv
       LEFT JOIN profile_view_reveals pvr
         ON pvr.owner_user_id = pv.owner_user_id AND pvr.viewer_user_id = pv.viewer_user_id
       INNER JOIN users u ON u.id = pv.viewer_user_id AND u.deleted_at IS NULL
       LEFT JOIN blocks b1 ON b1.blocker_id = ? AND b1.blocked_id = pv.viewer_user_id
       LEFT JOIN blocks b2 ON b2.blocker_id = pv.viewer_user_id AND b2.blocked_id = ?
       WHERE pv.owner_user_id = ?
         AND pvr.viewer_user_id IS NULL
         AND b1.blocked_id IS NULL
         AND b2.blocker_id IS NULL`,
      [ownerId, ownerId, ownerId],
    );
    if (unrevealed.length === 0) return { count: 0 };

    const values = unrevealed.map((r) => `('${ownerId}', '${r.viewer_user_id}')`).join(',');
    await query(
      `INSERT IGNORE INTO profile_view_reveals (owner_user_id, viewer_user_id) VALUES ${values}`,
    );
    return { count: unrevealed.length };
  }

  async setOnboardingDone(userId, done = true) {
    await query(
      `UPDATE user_onboarding_flags SET onboarding_done = ? WHERE user_id = ?`,
      [done ? 1 : 0, userId],
    );
    return this.ensureOnboardingFlags(userId);
  }
}

module.exports = { UserRepository };
