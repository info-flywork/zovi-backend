'use strict';

const { WebSocketServer } = require('ws');
const { verifyIdToken } = require('../config/firebase');
const { AuthService } = require('./AuthService');
const { ChatService } = require('./ChatService');
const { realtimeHub } = require('./RealtimeHub');
const { logger } = require('../utils/logger');

const AUTH_TIMEOUT_MS = 5_000;
const WS_PATH = '/ws';
const MAX_PAYLOAD_BYTES = 64 * 1024;

const authService = new AuthService();
const chatService = new ChatService();

/**
 * Auth happens via a first-message handshake (not a URL query param) so the
 * Firebase token never lands in an access log. After that, the socket is a
 * two-way channel: send_message/typing/mark_read go out over it (acked by
 * reqId) and call the exact same ChatService methods the REST routes call —
 * one source of truth regardless of transport. The client falls back to
 * REST on its own if a request times out or the socket isn't connected, so
 * nothing here needs to be reliable on its own.
 */
function attachRealtimeServer(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://internal').pathname;
    } catch (_) {
      socket.destroy();
      return;
    }
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    let userId = null;
    const authTimer = setTimeout(() => {
      if (!userId) {
        try {
          ws.close(4401, 'auth_timeout');
        } catch (_) {}
      }
    }, AUTH_TIMEOUT_MS);
    authTimer.unref?.();

    const onFirstMessage = async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'auth' || !msg.token) {
          throw new Error('bad_auth_message');
        }
        const decoded = await verifyIdToken(msg.token);
        const user = await authService.users.findByFirebaseUid(decoded.uid);
        if (!user) throw new Error('no_user');

        clearTimeout(authTimer);
        userId = user.id;
        realtimeHub.register(userId, ws);
        ws.send(JSON.stringify({ type: 'auth:ok' }));
        ws.on('message', (raw2) => {
          handleClientMessage(userId, raw2, ws).catch((err) => {
            logger.warn('realtime_message_failed', { userId, message: err.message });
          });
        });
      } catch (err) {
        logger.warn('realtime_auth_failed', { message: err.message });
        try {
          ws.close(4401, 'auth_failed');
        } catch (_) {}
      }
    };

    ws.once('message', (raw) => {
      onFirstMessage(raw).catch(() => {
        try {
          ws.close(4401, 'auth_failed');
        } catch (_) {}
      });
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (userId) realtimeHub.unregister(userId, ws);
    });
    ws.on('error', () => {
      if (userId) realtimeHub.unregister(userId, ws);
    });
  });

  logger.info('realtime_server_attached', { path: WS_PATH });
  return wss;
}

function sendAck(ws, reqId, ok, data, err) {
  if (!reqId) return;
  const payload = ok
    ? { type: 'ack', reqId, ok: true, data: data ?? {} }
    : {
        type: 'ack',
        reqId,
        ok: false,
        code: err?.code || 'ERROR',
        message: err?.message || 'Request failed',
      };
  try {
    ws.send(JSON.stringify(payload));
  } catch (_) {}
}

async function handleClientMessage(userId, raw, ws) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch (_) {
    return;
  }
  const reqId = typeof msg?.reqId === 'string' ? msg.reqId : null;

  try {
    switch (msg?.type) {
      case 'send_message': {
        const message = await chatService.sendMessage(userId, msg.conversationId, {
          type: msg.messageType,
          body: msg.body,
          mediaUrl: msg.mediaUrl,
          replyToMessageId: msg.replyToMessageId,
          replyPreview: msg.replyPreview,
        });
        sendAck(ws, reqId, true, { message });
        break;
      }
      case 'typing': {
        const data = await chatService.pulseTyping(userId, msg.conversationId);
        sendAck(ws, reqId, true, data);
        break;
      }
      case 'mark_read': {
        const data = await chatService.markRead(userId, msg.conversationId);
        sendAck(ws, reqId, true, data);
        break;
      }
      default:
        break; // unknown/unhandled type — ignore, client will fall back to REST
    }
  } catch (err) {
    sendAck(ws, reqId, false, null, err);
  }
}

module.exports = { attachRealtimeServer };
