'use strict';

class OAuthIdentity {
  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.provider = row.provider;
    this.subject = row.subject;
    this.email = row.email ?? null;
    this.rawProfile =
      typeof row.raw_profile === 'string'
        ? JSON.parse(row.raw_profile)
        : row.raw_profile ?? null;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new OAuthIdentity(row);
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      provider: this.provider,
      subject: this.subject,
      email: this.email,
      createdAt: this.createdAt,
    };
  }
}

module.exports = { OAuthIdentity };
