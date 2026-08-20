'use strict';

/**
 * Process-local typing presence for chat threads.
 * Clients heartbeat while composing; entries expire quickly if they stop.
 */

const DEFAULT_TTL_MS = 4_500;

class ChatTypingStore {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    /** @type {Map<string, Map<string, { userId: string, name: string, username: string, avatarUrl: string, expiresAt: number }>>} */
    this._byConversation = new Map();
  }

  _prune(conversationId) {
    const map = this._byConversation.get(conversationId);
    if (!map) return;
    const now = Date.now();
    for (const [userId, entry] of map) {
      if (entry.expiresAt <= now) map.delete(userId);
    }
    if (map.size === 0) this._byConversation.delete(conversationId);
  }

  pulse(conversationId, user, { ttlMs } = {}) {
    const id = String(conversationId || '').trim();
    const userId = String(user?.userId || '').trim();
    if (!id || !userId) return;
    let map = this._byConversation.get(id);
    if (!map) {
      map = new Map();
      this._byConversation.set(id, map);
    }
    map.set(userId, {
      userId,
      name: String(user.name || user.username || '').trim(),
      username: String(user.username || '').trim(),
      avatarUrl: String(user.avatarUrl || '').trim(),
      expiresAt: Date.now() + (ttlMs || this.ttlMs),
    });
  }

  clear(conversationId, userId) {
    const id = String(conversationId || '').trim();
    const uid = String(userId || '').trim();
    if (!id || !uid) return;
    const map = this._byConversation.get(id);
    if (!map) return;
    map.delete(uid);
    if (map.size === 0) this._byConversation.delete(id);
  }

  list(conversationId, { excludeUserId } = {}) {
    const id = String(conversationId || '').trim();
    if (!id) return [];
    this._prune(id);
    const map = this._byConversation.get(id);
    if (!map) return [];
    const exclude = String(excludeUserId || '').trim();
    return [...map.values()]
      .filter((entry) => entry.userId !== exclude)
      .map((entry) => ({
        userId: entry.userId,
        name: entry.name,
        username: entry.username,
        avatarUrl: entry.avatarUrl,
      }));
  }
}

const chatTypingStore = new ChatTypingStore();

module.exports = { ChatTypingStore, chatTypingStore };
