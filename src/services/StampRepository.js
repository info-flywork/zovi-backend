'use strict';

const { query } = require('../config/database');
const { Stamp } = require('../models');

const SUPPORTED_LOCALES = new Set([
  'tr',
  'en',
  'es',
  'de',
  'fr',
  'it',
  'pt',
  'ru',
  'hi',
  'ko',
  'ja',
  'zh',
]);

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  const short = raw.split('-')[0];
  if (SUPPORTED_LOCALES.has(raw)) return raw;
  if (SUPPORTED_LOCALES.has(short)) return short;
  return 'en';
}

class StampRepository {
  async list({ locale = 'en', includeInactive = false } = {}) {
    const normalized = normalizeLocale(locale);
    const rows = await query(
      `SELECT
        s.id,
        s.slug,
        s.cdn_url,
        s.sort_order,
        s.is_active,
        s.created_at,
        s.updated_at,
        COALESCE(t_local.localized_name, t_en.localized_name, s.slug) AS localized_name,
        t_en.localized_name AS name_en
      FROM stamps s
      LEFT JOIN stamp_translations t_local
        ON t_local.stamp_id = s.id AND t_local.locale = ?
      LEFT JOIN stamp_translations t_en
        ON t_en.stamp_id = s.id AND t_en.locale = 'en'
      WHERE (? = 1 OR s.is_active = 1)
      ORDER BY s.sort_order ASC, s.slug ASC`,
      [normalized, includeInactive ? 1 : 0],
    );

    return rows.map((row) => Stamp.fromRow(row));
  }

  async findBySlug(slug) {
    const rows = await query(
      `SELECT
        s.id,
        s.slug,
        s.cdn_url,
        s.sort_order,
        s.is_active,
        s.created_at,
        s.updated_at,
        t_en.localized_name AS localized_name,
        t_en.localized_name AS name_en
      FROM stamps s
      LEFT JOIN stamp_translations t_en
        ON t_en.stamp_id = s.id AND t_en.locale = 'en'
      WHERE s.slug = ?
      LIMIT 1`,
      [slug],
    );
    return Stamp.fromRow(rows[0]);
  }

  /**
   * Idempotent award — safe to call on every phone sync.
   * @returns {Promise<{ awarded: boolean, stamp: Stamp|null }>}
   */
  async awardToUser(userId, slug, { source = 'system' } = {}) {
    const stamp = await this.findBySlug(slug);
    if (!stamp || !stamp.isActive) {
      return { awarded: false, stamp: null };
    }

    const result = await query(
      `INSERT IGNORE INTO user_stamps (user_id, stamp_id, source)
       VALUES (?, ?, ?)`,
      [userId, stamp.id, source],
    );

    return {
      awarded: (result?.affectedRows ?? 0) > 0,
      stamp,
    };
  }

  async listForUser(userId, { locale = 'en' } = {}) {
    const normalized = normalizeLocale(locale);
    const rows = await query(
      `SELECT
        s.id,
        s.slug,
        s.cdn_url,
        s.sort_order,
        s.is_active,
        s.created_at,
        s.updated_at,
        COALESCE(t_local.localized_name, t_en.localized_name, s.slug) AS localized_name,
        t_en.localized_name AS name_en,
        us.earned_at,
        us.source AS award_source
      FROM user_stamps us
      JOIN stamps s ON s.id = us.stamp_id
      LEFT JOIN stamp_translations t_local
        ON t_local.stamp_id = s.id AND t_local.locale = ?
      LEFT JOIN stamp_translations t_en
        ON t_en.stamp_id = s.id AND t_en.locale = 'en'
      WHERE us.user_id = ?
        AND s.is_active = 1
      ORDER BY us.earned_at DESC, s.sort_order ASC`,
      [normalized, userId],
    );

    return rows.map((row) => Stamp.fromRow(row));
  }
}

module.exports = { StampRepository, normalizeLocale };
