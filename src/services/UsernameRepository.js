'use strict';

const { query, withTransaction } = require('../config/database');
const { Username } = require('../models/Username');
const { logger } = require('../utils/logger');

/**
 * High-performance username registry (PK = username).
 * Lookups are single-row primary key reads.
 */
class UsernameRepository {
  /**
   * @param {string} username normalized lowercase
   * @returns {Promise<Username | null>}
   */
  async findByUsername(username) {
    const rows = await query(
      'SELECT username, user_id, created_at, updated_at FROM usernames WHERE username = ? LIMIT 1',
      [username],
    );
    return Username.fromRow(rows[0]);
  }

  /**
   * Fast existence check via PRIMARY KEY.
   * @param {string} username
   * @param {string | null} excludeUserId
   */
  async isTaken(username, excludeUserId = null) {
    if (excludeUserId) {
      const rows = await query(
        'SELECT 1 FROM usernames WHERE username = ? AND user_id <> ? LIMIT 1',
        [username, excludeUserId],
      );
      return rows.length > 0;
    }
    const rows = await query(
      'SELECT 1 FROM usernames WHERE username = ? LIMIT 1',
      [username],
    );
    return rows.length > 0;
  }

  /**
   * Batch PK lookup for suggestion filtering.
   * @param {string[]} candidates
   * @returns {Promise<Set<string>>} taken usernames
   */
  async findTakenSet(candidates) {
    if (!candidates.length) return new Set();

    const placeholders = candidates.map(() => '?').join(',');
    const rows = await query(
      `SELECT username FROM usernames WHERE username IN (${placeholders})`,
      candidates,
    );
    return new Set(rows.map((r) => r.username));
  }

  /**
   * Assign username to user (replaces previous). Transactional.
   */
  async assign(userId, username) {
    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM usernames WHERE user_id = ?', [userId]);
      await conn.execute(
        `INSERT INTO usernames (username, user_id) VALUES (?, ?)`,
        [username, userId],
      );
      await conn.execute(
        `UPDATE user_profiles SET username = ? WHERE user_id = ?`,
        [username, userId],
      );
    });

    logger.info('username_assigned', { userId, username });
    return this.findByUsername(username);
  }
}

module.exports = { UsernameRepository };
