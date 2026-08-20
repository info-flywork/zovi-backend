'use strict';

const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { MockAiService } = require('./MockAiService');

/** Mock character user ids from `seed-mock-chars.js`. */
const MOCK_USER_ID_PREFIX = 'f0c4a000-';
const MOCK_FIREBASE_PREFIX = 'zovi_mock_char_';

function isMockUserId(userId) {
  return String(userId || '').startsWith(MOCK_USER_ID_PREFIX);
}

function delayMs(min = 1600, max = 4800) {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

function pick(list) {
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Mock characters reply via OpenAI (+ ElevenLabs/OpenAI TTS for voice).
 */
class MockChatService {
  constructor({ chatService, ai = new MockAiService() } = {}) {
    this.chatService = chatService;
    this.ai = ai;
    /** @type {Map<string, NodeJS.Timeout>} */
    this._timers = new Map();
    this._stampCache = null;
    this._stampCachedAt = 0;
  }

  isMockUserId(userId) {
    return isMockUserId(userId);
  }

  maybeAutoReply({
    conversationId,
    senderId,
    isDm,
    peerIds = [],
    inboundType,
    inboundBody,
  } = {}) {
    try {
      if (!conversationId || !senderId) return;
      if (isMockUserId(senderId)) return;

      if (isDm) {
        const peerId = String(peerIds[0] || '').trim();
        if (!peerId || !isMockUserId(peerId)) return;
        this._schedule({
          key: `dm:${conversationId}`,
          conversationId,
          mockUserId: peerId,
          isGroup: false,
          inboundType,
          inboundBody,
          realUserId: senderId,
        });
        return;
      }

      // Tribe / group: always reply after a short quiet window so rapid
      // messages coalesce into one natural response (never drop to silence).
      this._scheduleGroupDebounced({
        conversationId,
        senderId,
        inboundType,
        inboundBody,
      });
    } catch (err) {
      logger.warn('mock_chat_schedule_failed', {
        error: err?.message || String(err),
      });
    }
  }

  _scheduleGroupDebounced({
    conversationId,
    senderId,
    inboundType,
    inboundBody,
  }) {
    const key = `group:${conversationId}`;
    const existing = this._timers.get(key);
    if (existing) clearTimeout(existing);

    const wait = delayMs(1800, 3600);

    // Pick once so typing dots and actual replies use the same people.
    const respondersPromise = this._pickGroupResponders(
      conversationId,
      senderId,
      inboundBody,
    );

    respondersPromise
      .then(async (responders) => {
        for (const mockUserId of responders.slice(0, 2)) {
          const persona = await this._loadPersona(mockUserId);
          this.chatService?.setTypingPresence(
            conversationId,
            {
              userId: mockUserId,
              name: persona.name,
              username: persona.username,
              avatarUrl: persona.avatarUrl,
            },
            { ttlMs: wait + 12_000 },
          );
        }
      })
      .catch(() => {});

    const timer = setTimeout(() => {
      this._timers.delete(key);
      respondersPromise
        .then(async (responders) => {
          if (!responders.length) {
            logger.warn('mock_chat_no_member', { conversationId });
            return;
          }
          logger.info('mock_chat_group_reply_start', {
            conversationId,
            responders,
          });

          for (let i = 0; i < responders.length; i += 1) {
            if (i > 0) {
              await new Promise((r) => setTimeout(r, delayMs(900, 2400)));
            }
            await this._sendReply({
              conversationId,
              mockUserId: responders[i],
              isGroup: true,
              inboundType,
              inboundBody,
              realUserId: senderId,
            });
          }
        })
        .catch((err) => {
          logger.warn('mock_chat_group_reply_failed', {
            conversationId,
            error: err?.message || String(err),
          });
        });
    }, wait);
    if (typeof timer.unref === 'function') timer.unref();
    this._timers.set(key, timer);
  }

  /**
   * @mention → only that mock (rarely +1 bystander).
   * Otherwise → 1–4 random mocks with a natural distribution.
   */
  async _pickGroupResponders(conversationId, excludeUserId, inboundBody) {
    const mentioned = await this._resolveMentionedMock(
      conversationId,
      excludeUserId,
      inboundBody,
    );

    if (mentioned) {
      const picked = [mentioned];
      // Occasional bystander, not a pile-on.
      if (Math.random() < 0.18) {
        const extra = await this._pickMockMember(
          conversationId,
          excludeUserId,
          picked,
        );
        if (extra) picked.push(extra);
      }
      return picked;
    }

    const roll = Math.random();
    // 1: 42% · 2: 32% · 3: 18% · 4: 8%
    const want =
      roll < 0.42 ? 1 : roll < 0.74 ? 2 : roll < 0.92 ? 3 : 4;

    const picked = [];
    while (picked.length < want) {
      const next = await this._pickMockMember(
        conversationId,
        excludeUserId,
        picked,
      );
      if (!next) break;
      picked.push(next);
    }
    return picked;
  }

  async _resolveMentionedMock(conversationId, excludeUserId, inboundBody) {
    const handles = [
      ...String(inboundBody || '').matchAll(/@([^\s@]+)/g),
    ].map((m) => String(m[1] || '').trim().toLowerCase());
    if (!handles.length) return null;

    const rows = await query(
      `SELECT cm.user_id AS userId,
              LOWER(TRIM(up.username)) AS username,
              LOWER(TRIM(up.full_name)) AS fullName
       FROM conversation_members cm
       INNER JOIN users u ON u.id = cm.user_id
       INNER JOIN user_profiles up ON up.user_id = cm.user_id
       WHERE cm.conversation_id = ?
         AND cm.deleted_at IS NULL
         AND cm.user_id <> ?
         AND u.firebase_uid LIKE ?`,
      [conversationId, excludeUserId, `${MOCK_FIREBASE_PREFIX}%`],
    );

    for (const handle of handles) {
      for (const row of rows) {
        const username = String(row.username || '');
        const fullName = String(row.fullName || '');
        const first = fullName.split(/\s+/)[0] || '';
        if (
          (username && username === handle) ||
          (first && first === handle) ||
          (fullName && fullName.replace(/\s+/g, '') === handle)
        ) {
          return String(row.userId);
        }
      }
    }
    return null;
  }

  _schedule(opts) {
    const { key, conversationId, mockUserId } = opts;
    const existing = this._timers.get(key);
    if (existing) clearTimeout(existing);

    const wait = delayMs();
    logger.info('mock_chat_dm_reply_scheduled', {
      conversationId,
      mockUserId,
      waitMs: wait,
    });

    // Show typing dots during the natural delay before the reply.
    this._loadPersona(mockUserId)
      .then((persona) => {
        this.chatService?.setTypingPresence(
          conversationId,
          {
            userId: mockUserId,
            name: persona.name,
            username: persona.username,
            avatarUrl: persona.avatarUrl,
          },
          { ttlMs: wait + 8_000 },
        );
      })
      .catch(() => {});

    const timer = setTimeout(() => {
      this._timers.delete(key);
      this._sendReply(opts).catch((err) => {
        logger.warn('mock_chat_reply_failed', {
          conversationId: opts.conversationId,
          mockUserId: opts.mockUserId,
          error: err?.message || String(err),
        });
      });
    }, wait);
    if (typeof timer.unref === 'function') timer.unref();
    this._timers.set(key, timer);
  }

  async _pickMockMember(conversationId, excludeUserId, alsoExclude = null) {
    const extras = Array.isArray(alsoExclude)
      ? alsoExclude.map((id) => String(id || '').trim()).filter(Boolean)
      : String(alsoExclude || '').trim()
        ? [String(alsoExclude).trim()]
        : [];
    const excludeClause = extras.map(() => 'AND cm.user_id <> ?').join(' ');
    const rows = await query(
      `SELECT cm.user_id AS userId
       FROM conversation_members cm
       INNER JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ?
         AND cm.deleted_at IS NULL
         AND cm.user_id <> ?
         ${excludeClause}
         AND u.firebase_uid LIKE ?
       ORDER BY RAND()
       LIMIT 1`,
      [
        conversationId,
        excludeUserId,
        ...extras,
        `${MOCK_FIREBASE_PREFIX}%`,
      ],
    );
    return rows[0]?.userId ? String(rows[0].userId) : null;
  }

  async _loadPersona(mockUserId) {
    const rows = await query(
      `SELECT full_name AS fullName,
              username,
              location_text AS location,
              avatar_url AS avatarUrl,
              elevenlabs_voice_id AS elevenlabsVoiceId
       FROM user_profiles
       WHERE user_id = ?
       LIMIT 1`,
      [mockUserId],
    );
    const row = rows[0] || {};
    return {
      name: String(row.fullName || row.username || 'Zovi').trim() || 'Zovi',
      username: String(row.username || '').trim(),
      location: String(row.location || '').trim(),
      avatarUrl: String(row.avatarUrl || '').trim(),
      elevenlabsVoiceId: String(row.elevenlabsVoiceId || '').trim(),
    };
  }

  async _loadHistory(conversationId, mockUserId, realUserId) {
    const rows = await query(
      `SELECT sender_id AS senderId, type, body
       FROM messages
       WHERE conversation_id = ?
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 12`,
      [conversationId],
    );
    return rows
      .reverse()
      .map((row) => {
        const senderId = String(row.senderId || '');
        const type = String(row.type || 'text');
        const body = String(row.body || '').trim();
        let content = body;
        if (type === 'voice') content = '[sesli mesaj]';
        else if (type === 'stamp') content = '[sticker]';
        else if (type === 'image') content = '[fotoğraf]';
        else if (!content) content = '[mesaj]';
        return {
          role: senderId === mockUserId ? 'assistant' : 'user',
          content,
          // keep only human + this mock turns when possible
          _keep:
            senderId === mockUserId ||
            senderId === realUserId ||
            !realUserId,
        };
      })
      .filter((m) => m._keep)
      .map(({ role, content }) => ({ role, content }));
  }

  async _loadStamps() {
    const now = Date.now();
    if (this._stampCache && now - this._stampCachedAt < 10 * 60_000) {
      return this._stampCache;
    }
    const rows = await query(
      `SELECT id, cdn_url AS cdnUrl
       FROM stamps
       WHERE is_active = 1
         AND cdn_url IS NOT NULL
         AND TRIM(cdn_url) <> ''
       ORDER BY sort_order ASC
       LIMIT 80`,
    );
    this._stampCache = rows
      .map((r) => ({
        id: String(r.id || ''),
        url: String(r.cdnUrl || '').trim(),
      }))
      .filter((r) => r.url);
    this._stampCachedAt = now;
    return this._stampCache;
  }

  async _sendReply({
    conversationId,
    mockUserId,
    isGroup,
    inboundType,
    inboundBody,
    realUserId,
  }) {
    if (!this.chatService) return;

    const [persona, history] = await Promise.all([
      this._loadPersona(mockUserId),
      this._loadHistory(conversationId, mockUserId, realUserId),
    ]);

    // Show typing dots while the mock "thinks" / generates TTS.
    this.chatService.setTypingPresence(
      conversationId,
      {
        userId: mockUserId,
        name: persona.name,
        username: persona.username,
        avatarUrl: persona.avatarUrl,
      },
      { ttlMs: 45_000 },
    );

    try {
      const decision = await this.ai.generateReply({
        persona,
        history,
        inboundType: inboundType || 'text',
        inboundBody: inboundBody || '',
        isGroup: Boolean(isGroup),
      });

      let type = decision.type || 'text';
      let body = decision.text || '';
      let mediaUrl = null;

      if (type === 'voice') {
        const spoken = body || 'Tamam, birazdan yazıyorum.';
        // Keep typing alive during TTS + upload.
        this.chatService.setTypingPresence(
          conversationId,
          {
            userId: mockUserId,
            name: persona.name,
            username: persona.username,
            avatarUrl: persona.avatarUrl,
          },
          { ttlMs: 60_000 },
        );
        const voice = await this.ai.synthesizeVoice({
          text: spoken,
          mockUserId,
          voiceId: persona.elevenlabsVoiceId,
        });
        if (voice?.mediaUrl) {
          mediaUrl = voice.mediaUrl;
          body = voice.durationMs;
        } else {
          type = 'text';
          body = spoken;
        }
      } else if (type === 'stamp') {
        const stamps = await this._loadStamps();
        const stamp = pick(stamps);
        if (stamp) {
          mediaUrl = stamp.url;
          body = stamp.id || 'stamp';
        } else if (body) {
          type = 'text';
        } else {
          type = 'text';
          body = '👍';
        }
      } else {
        type = 'text';
        body = body || 'Tamam.';
      }

      await this.chatService.sendMessage(mockUserId, conversationId, {
        type,
        body,
        mediaUrl,
      });
    } finally {
      this.chatService.clearTypingPresence(conversationId, mockUserId);
    }
  }
}

module.exports = {
  MockChatService,
  isMockUserId,
  MOCK_USER_ID_PREFIX,
  MOCK_FIREBASE_PREFIX,
};
