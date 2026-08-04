'use strict';

class Username {
  constructor(row) {
    this.username = row.username;
    this.userId = row.user_id;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new Username(row);
  }

  toJSON() {
    return {
      username: this.username,
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { Username };
