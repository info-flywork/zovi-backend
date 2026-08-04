'use strict';

class Stamp {
  constructor(row) {
    this.id = row.id;
    this.slug = row.slug;
    this.cdnUrl = row.cdn_url;
    this.sortOrder = row.sort_order ?? 0;
    this.isActive = Boolean(row.is_active);
    this.localizedName = row.localized_name ?? row.name_en ?? row.slug;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new Stamp(row);
  }

  toJSON() {
    return {
      id: this.id,
      slug: this.slug,
      name: this.localizedName,
      cdnUrl: this.cdnUrl,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { Stamp };
