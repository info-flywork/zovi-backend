'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../config/database');
const { AccountDeletionRequest } = require('../models/AccountDeletionRequest');
const { logger } = require('../utils/logger');

const GRACE_DAYS = 30;

class AccountDeletionService {
  async findPendingByUser(userId) {
    const rows = await query(
      `SELECT * FROM account_deletion_requests
       WHERE user_id = ? AND status = 'pending'
       ORDER BY requested_at DESC
       LIMIT 1`,
      [userId],
    );
    return AccountDeletionRequest.fromRow(rows[0]);
  }

  /**
   * Creates a pending deletion request (+30 day grace).
   * If one is already pending, returns the existing row.
   */
  async createRequest(userId, reason) {
    const existing = await this.findPendingByUser(userId);
    if (existing) {
      logger.info('deletion_request_already_pending', {
        userId,
        requestId: existing.id,
      });
      return { created: false, request: existing };
    }

    const id = randomUUID();
    const trimmed = reason == null ? null : String(reason).trim().slice(0, 2000);
    const reasonValue = trimmed && trimmed.length > 0 ? trimmed : null;

    await query(
      `INSERT INTO account_deletion_requests
        (id, user_id, reason, status, scheduled_purge_at)
       VALUES (?, ?, ?, 'pending', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY))`,
      [id, userId, reasonValue, GRACE_DAYS],
    );

    const rows = await query(
      'SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1',
      [id],
    );
    const request = AccountDeletionRequest.fromRow(rows[0]);

    logger.info('deletion_request_created', {
      userId,
      requestId: id,
      hasReason: Boolean(reasonValue),
      scheduledPurgeAt: request.scheduledPurgeAt,
    });

    return { created: true, request };
  }
}

module.exports = { AccountDeletionService };
