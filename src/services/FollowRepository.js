'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { localizedMockName, isMockUserId } = require('../utils/mockNameI18n');
const { getRequestLocale } = require('../utils/requestContext');

class FollowRepository {
  async isFollowing(followerId, followingId) {
    if (!followerId || !followingId || followerId === followingId) return false;
    const rows = await query(
      `SELECT 1 FROM follows
       WHERE follower_id = ? AND following_id = ?
       LIMIT 1`,
      [followerId, followingId],
    );
    return Boolean(rows[0]);
  }

  async getRelationship(viewerId, targetId) {
    if (!viewerId || !targetId || viewerId === targetId) {
      return {
        following: false,
        followedBy: false,
        outgoingRequest: false,
        incomingRequest: false,
        incomingRequestId: null,
        outgoingRequestId: null,
      };
    }

    const [followRows, requestRows] = await Promise.all([
      query(
        `SELECT follower_id, following_id FROM follows
         WHERE (follower_id = ? AND following_id = ?)
            OR (follower_id = ? AND following_id = ?)`,
        [viewerId, targetId, targetId, viewerId],
      ),
      query(
        `SELECT id, from_user_id, to_user_id FROM follow_requests
         WHERE status = 'pending'
           AND (
             (from_user_id = ? AND to_user_id = ?)
             OR (from_user_id = ? AND to_user_id = ?)
           )`,
        [viewerId, targetId, targetId, viewerId],
      ),
    ]);

    const following = followRows.some(
      (r) => r.follower_id === viewerId && r.following_id === targetId,
    );
    const followedBy = followRows.some(
      (r) => r.follower_id === targetId && r.following_id === viewerId,
    );
    const outgoing = requestRows.find(
      (r) => r.from_user_id === viewerId && r.to_user_id === targetId,
    );
    const incoming = requestRows.find(
      (r) => r.from_user_id === targetId && r.to_user_id === viewerId,
    );

    return {
      following,
      followedBy,
      outgoingRequest: Boolean(outgoing),
      incomingRequest: Boolean(incoming),
      outgoingRequestId: outgoing?.id || null,
      incomingRequestId: incoming?.id || null,
    };
  }

  /** Subset of [targetIds] that [followerId] already follows. */
  async filterFollowing(followerId, targetIds) {
    const ids = [...new Set(targetIds.filter(Boolean))];
    if (!followerId || ids.length === 0) return new Set();
    const rows = await query(
      `SELECT following_id FROM follows
       WHERE follower_id = ?
         AND following_id IN (${ids.map(() => '?').join(',')})`,
      [followerId, ...ids],
    );
    return new Set(rows.map((r) => r.following_id));
  }

  /** Subset of [targetIds] with a pending request from [fromUserId]. */
  async filterPendingOutgoing(fromUserId, targetIds) {
    const ids = [...new Set(targetIds.filter(Boolean))];
    if (!fromUserId || ids.length === 0) return new Set();
    const rows = await query(
      `SELECT to_user_id FROM follow_requests
       WHERE from_user_id = ?
         AND status = 'pending'
         AND to_user_id IN (${ids.map(() => '?').join(',')})`,
      [fromUserId, ...ids],
    );
    return new Set(rows.map((r) => r.to_user_id));
  }

  /** Map of requestId → status for the given ids. */
  async getRequestStatuses(requestIds) {
    const ids = [...new Set(requestIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const rows = await query(
      `SELECT id, status FROM follow_requests
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    return new Map(rows.map((r) => [r.id, r.status]));
  }

  async createFollow(followerId, followingId) {
    if (!followerId || !followingId || followerId === followingId) {
      return { created: false };
    }
    const result = await query(
      `INSERT IGNORE INTO follows (follower_id, following_id)
       VALUES (?, ?)`,
      [followerId, followingId],
    );
    const created = result.affectedRows > 0;
    if (created) {
      await Promise.all([
        query(
          `UPDATE user_profiles SET following_count = following_count + 1
           WHERE user_id = ?`,
          [followerId],
        ),
        query(
          `UPDATE user_profiles SET followers_count = followers_count + 1
           WHERE user_id = ?`,
          [followingId],
        ),
      ]);
    }
    return { created };
  }

  async deleteFollow(followerId, followingId) {
    const result = await query(
      `DELETE FROM follows
       WHERE follower_id = ? AND following_id = ?`,
      [followerId, followingId],
    );
    const removed = result.affectedRows > 0;
    if (removed) {
      await Promise.all([
        query(
          `UPDATE user_profiles
           SET following_count = GREATEST(following_count - 1, 0)
           WHERE user_id = ?`,
          [followerId],
        ),
        query(
          `UPDATE user_profiles
           SET followers_count = GREATEST(followers_count - 1, 0)
           WHERE user_id = ?`,
          [followingId],
        ),
      ]);
    }
    return { removed };
  }

  async createRequest(fromUserId, toUserId) {
    const existing = await query(
      `SELECT id, status FROM follow_requests
       WHERE from_user_id = ? AND to_user_id = ?
       LIMIT 1`,
      [fromUserId, toUserId],
    );

    if (existing[0]) {
      if (existing[0].status === 'pending') {
        return { id: existing[0].id, created: false };
      }
      await query(
        `UPDATE follow_requests
         SET status = 'pending',
             responded_at = NULL,
             created_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [existing[0].id],
      );
      return { id: existing[0].id, created: true };
    }

    const id = randomUUID();
    await query(
      `INSERT INTO follow_requests (id, from_user_id, to_user_id, status)
       VALUES (?, ?, ?, 'pending')`,
      [id, fromUserId, toUserId],
    );
    return { id, created: true };
  }

  async findRequestById(id) {
    const rows = await query(
      `SELECT id, from_user_id, to_user_id, status, created_at, responded_at
       FROM follow_requests WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  async findPendingRequest(fromUserId, toUserId) {
    const rows = await query(
      `SELECT id, from_user_id, to_user_id, status, created_at
       FROM follow_requests
       WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
       LIMIT 1`,
      [fromUserId, toUserId],
    );
    return rows[0] || null;
  }

  async acceptRequest(requestId) {
    const req = await this.findRequestById(requestId);
    if (!req || req.status !== 'pending') return null;

    await query(
      `UPDATE follow_requests
       SET status = 'accepted', responded_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND status = 'pending'`,
      [requestId],
    );
    await this.createFollow(req.from_user_id, req.to_user_id);
    return req;
  }

  async rejectRequest(requestId) {
    const req = await this.findRequestById(requestId);
    if (!req || req.status !== 'pending') return null;
    await query(
      `UPDATE follow_requests
       SET status = 'rejected', responded_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND status = 'pending'`,
      [requestId],
    );
    return req;
  }

  async cancelRequest(fromUserId, toUserId) {
    const result = await query(
      `UPDATE follow_requests
       SET status = 'cancelled', responded_at = UTC_TIMESTAMP(3)
       WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'`,
      [fromUserId, toUserId],
    );
    return result.affectedRows > 0;
  }

  
  _mapFollowUserRow(row) {
    if (!row) return row;
    const userId = row.user_id;
    const fullName = isMockUserId(userId)
      ? (localizedMockName(userId, getRequestLocale()) || row.full_name)
      : row.full_name;
    return { ...row, full_name: fullName };
  }

  async listFollowers(userId, { limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = await query(
      `SELECT up.user_id AS user_id,
              up.username,
              up.full_name,
              up.avatar_url
       FROM follows f
       INNER JOIN user_profiles up ON up.user_id = f.follower_id
       WHERE f.following_id = ?
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, safeLimit, safeOffset],
    );
    return rows.map((r) => this._mapFollowUserRow(r));
  }

  async listFollowing(userId, { limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = await query(
      `SELECT up.user_id AS user_id,
              up.username,
              up.full_name,
              up.avatar_url
       FROM follows f
       INNER JOIN user_profiles up ON up.user_id = f.following_id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, safeLimit, safeOffset],
    );
    return rows.map((r) => this._mapFollowUserRow(r));
  }
}

module.exports = { FollowRepository };