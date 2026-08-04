'use strict';

class ProfileLink {
  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.title = row.title;
    this.url = row.url;
    this.sortOrder = row.sort_order ?? 0;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new ProfileLink(row);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      url: this.url,
      sortOrder: this.sortOrder,
    };
  }
}

module.exports = { ProfileLink };
