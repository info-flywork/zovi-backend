'use strict';

/**
 * Small process-local TTL cache with LRU eviction + in-flight dedupe.
 * Safe default for read-heavy endpoints — never blocks writes; callers
 * must invalidate (or rely on short TTL) after mutations.
 */
class TtlCache {
  /**
   * @param {{ max?: number, defaultTtlMs?: number, name?: string }} [opts]
   */
  constructor({ max = 500, defaultTtlMs = 15_000, name = 'cache' } = {}) {
    this.max = Math.max(1, max);
    this.defaultTtlMs = Math.max(0, defaultTtlMs);
    this.name = name;
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this._store = new Map();
    /** @type {Map<string, Promise<unknown>>} */
    this._inflight = new Map();
  }

  get size() {
    return this._store.size;
  }

  /**
   * @param {string} key
   * @returns {unknown | undefined}
   */
  get(key) {
    const item = this._store.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    // refresh LRU order
    this._store.delete(key);
    this._store.set(key, item);
    return item.value;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this._store.has(key)) this._store.delete(key);
    while (this._store.size >= this.max) {
      const oldest = this._store.keys().next().value;
      if (oldest === undefined) break;
      this._store.delete(oldest);
    }
    this._store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(0, ttlMs),
    });
  }

  /**
   * @param {string} key
   */
  delete(key) {
    this._store.delete(key);
  }

  /**
   * @param {string} prefix
   */
  deletePrefix(prefix) {
    if (!prefix) return;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  /**
   * @param {(key: string) => boolean} predicate
   */
  deleteWhere(predicate) {
    for (const key of this._store.keys()) {
      if (predicate(key)) this._store.delete(key);
    }
  }

  clear() {
    this._store.clear();
  }

  /**
   * Returns cached value or runs loader once (deduped for concurrent misses).
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} loader
   * @param {number} [ttlMs]
   * @returns {Promise<T>}
   */
  async getOrSet(key, loader, ttlMs = this.defaultTtlMs) {
    const hit = this.get(key);
    if (hit !== undefined) return /** @type {T} */ (hit);

    const pending = this._inflight.get(key);
    if (pending) return /** @type {Promise<T>} */ (pending);

    const promise = (async () => {
      try {
        const value = await loader();
        // Don't cache explicit miss markers unless caller wants — null is ok
        // for short TTL; undefined means "do not cache".
        if (value !== undefined) {
          this.set(key, value, ttlMs);
        }
        return value;
      } finally {
        this._inflight.delete(key);
      }
    })();

    this._inflight.set(key, promise);
    return promise;
  }
}

module.exports = { TtlCache };
