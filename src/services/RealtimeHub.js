'use strict';

const { logger } = require('../utils/logger');

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Process-local WebSocket push registry. Purely a "something changed, go
 * refetch" signal — clients always resolve state via the existing REST
 * endpoints, so a missed/duplicate event is harmless. Same single-instance
 * caveat as ChatTypingStore: under multiple backend instances an event
 * raised on instance A won't reach a socket connected to instance B (the
 * client's REST polling fallback covers that gap until it's worth a
 * pub/sub layer).
 */
class RealtimeHub {
  constructor({ heartbeatMs = HEARTBEAT_INTERVAL_MS } = {}) {
    /** @type {Map<string, Set<import('ws').WebSocket>>} */
    this._byUser = new Map();
    this._heartbeat = setInterval(() => this._sweep(), heartbeatMs);
    this._heartbeat.unref?.();
  }

  register(userId, ws) {
    const id = String(userId || '').trim();
    if (!id) return;
    let set = this._byUser.get(id);
    if (!set) {
      set = new Set();
      this._byUser.set(id, set);
    }
    set.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  unregister(userId, ws) {
    const id = String(userId || '').trim();
    if (!id) return;
    const set = this._byUser.get(id);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this._byUser.delete(id);
  }

  emitToUser(userId, event) {
    const id = String(userId || '').trim();
    if (!id) return;
    const set = this._byUser.get(id);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload, (err) => {
          if (err) logger.warn('realtime_send_failed', { userId: id, message: err.message });
        });
      }
    }
  }

  _sweep() {
    for (const [userId, set] of this._byUser) {
      for (const ws of set) {
        if (ws.isAlive === false) {
          set.delete(ws);
          try {
            ws.terminate();
          } catch (_) {}
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (_) {}
      }
      if (set.size === 0) this._byUser.delete(userId);
    }
  }
}

const realtimeHub = new RealtimeHub();

module.exports = { RealtimeHub, realtimeHub };
