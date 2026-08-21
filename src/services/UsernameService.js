'use strict';

const { logger } = require('../utils/logger');
const { UsernameRepository } = require('./UsernameRepository');

const USERNAME_MAX = 15;
/** Seeded mock handles may be longer (DB column VARCHAR(25)). */
const USERNAME_LOOKUP_MAX = 25;
const USERNAME_MIN = 3;
const CHECK_CACHE_TTL_MS = 10_000;
const CHECK_CACHE_MAX = 500;

function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX);
}

/** Public profile / by-username resolve — do not truncate below DB length. */
function normalizeUsernameLookup(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_LOOKUP_MAX);
}

function isValidUsername(username) {
  if (!username || username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return false;
  }
  return /^[a-z0-9_]+$/.test(username);
}

class UsernameService {
  constructor(usernameRepository = new UsernameRepository()) {
    this.usernames = usernameRepository;
    this._checkCache = new Map();
  }

  _cacheKey(username, excludeUserId) {
    return `${username}::${excludeUserId || '-'}`;
  }

  _cacheGet(username, excludeUserId) {
    const key = this._cacheKey(username, excludeUserId);
    const item = this._checkCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this._checkCache.delete(key);
      return null;
    }
    return item.value;
  }

  _cacheSet(username, excludeUserId, value) {
    if (this._checkCache.size >= CHECK_CACHE_MAX) {
      const oldestKey = this._checkCache.keys().next().value;
      if (oldestKey) this._checkCache.delete(oldestKey);
    }
    const key = this._cacheKey(username, excludeUserId);
    this._checkCache.set(key, {
      value,
      expiresAt: Date.now() + CHECK_CACHE_TTL_MS,
    });
  }

  /**
   * PK lookup on `usernames.username`.
   */
  async isTaken(username, excludeUserId = null) {
    return this.usernames.isTaken(username, excludeUserId);
  }

  /**
   * @returns {Promise<string[]>}
   */
  async suggest(baseRaw, excludeUserId = null, limit = 5) {
    const base = normalizeUsername(baseRaw) || 'user';
    const root = base.slice(0, Math.max(1, USERNAME_MAX - 4));
    const candidates = [];

    const push = (value) => {
      const n = normalizeUsername(value);
      if (!isValidUsername(n)) return;
      if (!candidates.includes(n) && n !== base) candidates.push(n);
    };

    for (let i = 1; i <= 40 && candidates.length < 30; i += 1) {
      push(`${root}${i}`);
      push(`${root}_${i}`);
    }

    const year = new Date().getFullYear().toString().slice(-2);
    push(`${root}${year}`);
    push(`${root}_zovi`);
    push(`the_${root}`.slice(0, USERNAME_MAX));
    push(`${root}x`);

    for (let i = 0; i < 12; i += 1) {
      const suffix = String(Math.floor(100 + Math.random() * 900));
      push(`${root.slice(0, USERNAME_MAX - 3)}${suffix}`);
    }

    if (candidates.length === 0) return [];

    const taken = await this.usernames.findTakenSet(candidates);
    const available = candidates.filter((c) => !taken.has(c)).slice(0, limit);

    logger.debug('username_suggestions', {
      base,
      candidates: candidates.length,
      available: available.length,
    });

    return available;
  }

  async check(rawUsername, excludeUserId = null) {
    const username = normalizeUsername(rawUsername);
    const cached = this._cacheGet(username, excludeUserId);
    if (cached) return cached;

    if (!isValidUsername(username)) {
      const invalid = {
        username,
        available: false,
        valid: false,
        suggestions: [],
        reason: 'INVALID',
      };
      this._cacheSet(username, excludeUserId, invalid);
      return invalid;
    }

    const taken = await this.isTaken(username, excludeUserId);
    if (!taken) {
      const available = {
        username,
        available: true,
        valid: true,
        suggestions: [],
        reason: null,
      };
      this._cacheSet(username, excludeUserId, available);
      return available;
    }

    const suggestions = await this.suggest(username, excludeUserId, 5);
    const takenResult = {
      username,
      available: false,
      valid: true,
      suggestions,
      reason: 'TAKEN',
    };
    this._cacheSet(username, excludeUserId, takenResult);
    return takenResult;
  }

  async claim(userId, username) {
    return this.usernames.assign(userId, username);
  }
}

module.exports = {
  UsernameService,
  normalizeUsername,
  normalizeUsernameLookup,
  isValidUsername,
  USERNAME_MAX,
  USERNAME_LOOKUP_MAX,
  USERNAME_MIN,
};
