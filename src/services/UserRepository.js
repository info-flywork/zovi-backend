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

class UserRepository {
  async findByFirebaseUid(firebaseUid) {
    const rows = await query(
      'SELECT * FROM users WHERE firebase_uid = ? AND deleted_at IS NULL LIMIT 1',
      [firebaseUid],
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

  async updateProfile(
    userId,
    { fullName, username, birthDate, bio, locationText, accountPrivacy },
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

  async setOnboardingDone(userId, done = true) {
    await query(
      `UPDATE user_onboarding_flags SET onboarding_done = ? WHERE user_id = ?`,
      [done ? 1 : 0, userId],
    );
    return this.ensureOnboardingFlags(userId);
  }
}

module.exports = { UserRepository };
