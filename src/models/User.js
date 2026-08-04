'use strict';

class User {
  constructor(row) {
    this.id = row.id;
    this.firebaseUid = row.firebase_uid;
    this.phoneE164 = row.phone_e164 ?? null;
    this.email = row.email ?? null;
    this.primaryAuth = row.primary_auth;
    this.phoneVerifiedAt = row.phone_verified_at ?? null;
    this.emailVerifiedAt = row.email_verified_at ?? null;
    this.status = row.status;
    this.lastLoginAt = row.last_login_at ?? null;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    this.deletedAt = row.deleted_at ?? null;
  }

  static fromRow(row) {
    if (!row) return null;
    return new User(row);
  }

  toJSON() {
    return {
      id: this.id,
      firebaseUid: this.firebaseUid,
      phoneE164: this.phoneE164,
      email: this.email,
      primaryAuth: this.primaryAuth,
      phoneVerifiedAt: this.phoneVerifiedAt,
      emailVerifiedAt: this.emailVerifiedAt,
      status: this.status,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { User };
