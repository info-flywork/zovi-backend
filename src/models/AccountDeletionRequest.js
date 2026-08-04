'use strict';

class AccountDeletionRequest {
  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.reason = row.reason ?? null;
    this.status = row.status;
    this.requestedAt = row.requested_at;
    this.scheduledPurgeAt = row.scheduled_purge_at ?? null;
    this.processedAt = row.processed_at ?? null;
  }

  static fromRow(row) {
    if (!row) return null;
    return new AccountDeletionRequest(row);
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      reason: this.reason,
      status: this.status,
      requestedAt: this.requestedAt,
      scheduledPurgeAt: this.scheduledPurgeAt,
      processedAt: this.processedAt,
    };
  }
}

module.exports = { AccountDeletionRequest };
