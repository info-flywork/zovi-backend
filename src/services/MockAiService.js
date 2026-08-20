'use strict';

const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { BunnyStorageService } = require('./BunnyStorageService');

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const ELEVEN_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

/** Stable OpenAI TTS voices — hashed per mock user. */
const OPENAI_VOICES = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
];

/** Optional ElevenLabs default voice ids (Rachel / Adam / Bella style). */
const ELEVEN_DEFAULT_VOICES = [
  '21m00Tcm4TlvDq8ikWAM',
  'pNInz6obpgDQGcFmaJgB',
  'EXAVITQu4vr4xnSDxMaL',
  'VR6AewLTigWG4xSOukaG',
];

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str || '').length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVoice(list, seed) {
  if (!list.length) return null;
  return list[hash32(seed) % list.length];
}

function estimateDurationMs(text) {
  const chars = String(text || '').trim().length;
  // ~14 chars/sec casual speech
  return Math.max(1200, Math.min(18000, Math.round((chars / 14) * 1000)));
}

/**
 * LLM + TTS helpers for mock character chat.
 * Prefers ElevenLabs when ELEVENLABS_API_KEY is set; otherwise OpenAI TTS.
 */
class MockAiService {
  constructor({ bunny = new BunnyStorageService() } = {}) {
    this.bunny = bunny;
  }

  get hasOpenAi() {
    return Boolean(env.openai?.apiKey);
  }

  get hasEleven() {
    return Boolean(env.elevenLabs?.apiKey);
  }

  get isConfigured() {
    return this.hasOpenAi;
  }

  async generateReply({
    persona,
    history = [],
    inboundType = 'text',
    inboundBody = '',
    isGroup = false,
  }) {
    if (!this.hasOpenAi) {
      return this._fallback(inboundType, isGroup);
    }

    const inboundLabel =
      inboundType === 'voice'
        ? '[sesli mesaj gönderdi]'
        : inboundType === 'stamp'
          ? '[sticker / stamp gönderdi]'
          : inboundType === 'image'
            ? '[fotoğraf gönderdi]'
            : String(inboundBody || '').trim() || '[mesaj]';

    const system = [
      `Sen Zovi uygulamasında gerçek bir kullanıcı gibi sohbet eden "${persona.name}" adlı kişisin.`,
      persona.location ? `Konumun: ${persona.location}.` : '',
      isGroup
        ? 'Bu bir tribe grup sohbeti. Kısa, doğal, grup ortamına uygun cevap ver.'
        : 'Bu birebir DM. Samimi, kısa, Snapchat/WhatsApp tarzı yaz.',
      'Kurallar:',
      '- Türkçe konuş (karşı taraf İngilizce yazarsa karışık olabilir).',
      '- En fazla 1-2 kısa cümle. Uzun paragraf yok.',
      '- Robot gibi / asistan gibi konuşma. Emoji az ve yerinde.',
      '- Asla AI, bot, OpenAI, sistem olduğunu söyleme.',
      '- JSON dışında hiçbir şey yazma.',
      'JSON şema: {"type":"text"|"voice"|"stamp","text":"string"}',
      '- type=text: normal yazı cevabı (text alanı zorunlu)',
      '- type=voice: sesli mesaj; text alanı seslendirilecek kısa cümle',
      '- type=stamp: sticker at; text alanı kısa tepki veya boş olabilir',
      inboundType === 'voice'
        ? 'Karşı taraf ses attıysa sen de sıkça voice tercih et.'
        : '',
      inboundType === 'stamp'
        ? 'Karşı taraf sticker attıysa stamp veya kısa text.'
        : '',
      'Çoğunlukla text; ara sıra voice; nadiren stamp.',
    ]
      .filter(Boolean)
      .join('\n');

    const messages = [
      { role: 'system', content: system },
      ...history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: inboundLabel },
    ];

    try {
      const response = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.openai.chatModel || 'gpt-4o-mini',
          temperature: 0.9,
          max_tokens: 120,
          response_format: { type: 'json_object' },
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        logger.warn('mock_ai_chat_failed', {
          status: response.status,
          body: errText.slice(0, 240),
        });
        return this._fallback(inboundType, isGroup);
      }

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content || '';
      const parsed = this._parseJson(raw);
      if (!parsed?.text && parsed?.type !== 'stamp') {
        return this._fallback(inboundType, isGroup);
      }

      const type = ['text', 'voice', 'stamp'].includes(parsed.type)
        ? parsed.type
        : 'text';
      const text = String(parsed.text || '').trim().slice(0, 280);
      return { type, text: text || (type === 'stamp' ? '' : 'Tamam 👍') };
    } catch (err) {
      logger.warn('mock_ai_chat_error', { error: err?.message || String(err) });
      return this._fallback(inboundType, isGroup);
    }
  }

  /**
   * Synthesize speech and upload to Bunny. Returns { mediaUrl, durationMs }.
   */
  async synthesizeVoice({ text, mockUserId, voiceId: preferredVoiceId }) {
    const spoken = String(text || '').trim().slice(0, 400);
    if (!spoken) return null;

    let audioBuffer = null;
    const contentType = 'audio/mpeg';
    const ext = 'mp3';

    if (this.hasEleven) {
      const voiceId =
        String(preferredVoiceId || '').trim() ||
        String(env.elevenLabs.voiceId || '').trim() ||
        pickVoice(ELEVEN_DEFAULT_VOICES, mockUserId) ||
        ELEVEN_DEFAULT_VOICES[0];
      try {
        const response = await fetch(`${ELEVEN_TTS_URL}/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': env.elevenLabs.apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: spoken,
            model_id: env.elevenLabs.modelId || 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.75,
              style: 0.35,
              use_speaker_boost: true,
            },
          }),
        });
        if (response.ok) {
          audioBuffer = Buffer.from(await response.arrayBuffer());
        } else {
          const errText = await response.text().catch(() => '');
          logger.warn('mock_eleven_tts_failed', {
            status: response.status,
            voiceId,
            body: errText.slice(0, 200),
          });
        }
      } catch (err) {
        logger.warn('mock_eleven_tts_error', {
          error: err?.message || String(err),
        });
      }
    }

    if (!audioBuffer && this.hasOpenAi) {
      const voice = pickVoice(OPENAI_VOICES, mockUserId) || 'nova';
      try {
        const response = await fetch(OPENAI_TTS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.openai.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: env.openai.ttsModel || 'gpt-4o-mini-tts',
            voice,
            input: spoken,
            response_format: 'mp3',
          }),
        });
        if (response.ok) {
          audioBuffer = Buffer.from(await response.arrayBuffer());
        } else {
          // Older accounts may only have tts-1
          const retry = await fetch(OPENAI_TTS_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.openai.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'tts-1',
              voice,
              input: spoken,
              response_format: 'mp3',
            }),
          });
          if (retry.ok) {
            audioBuffer = Buffer.from(await retry.arrayBuffer());
          } else {
            const errText = await retry.text().catch(() => '');
            logger.warn('mock_openai_tts_failed', {
              status: retry.status,
              body: errText.slice(0, 200),
            });
          }
        }
      } catch (err) {
        logger.warn('mock_openai_tts_error', {
          error: err?.message || String(err),
        });
      }
    }

    if (!audioBuffer || !audioBuffer.length) return null;
    if (!this.bunny.isConfigured) return null;

    const path = `chat/mock/${mockUserId}/${randomUUID()}.${ext}`;
    const uploaded = await this.bunny.uploadBuffer(
      audioBuffer,
      path,
      contentType,
    );
    return {
      mediaUrl: uploaded.url,
      durationMs: String(estimateDurationMs(spoken)),
    };
  }

  _parseJson(raw) {
    try {
      return JSON.parse(String(raw || '').trim());
    } catch (_) {
      const match = String(raw || '').match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
  }

  _fallback(inboundType, isGroup) {
    if (inboundType === 'stamp') {
      return { type: 'stamp', text: '' };
    }
    if (inboundType === 'voice') {
      return {
        type: 'voice',
        text: isGroup ? 'Ben de buradayım.' : 'Sesini aldım, birazdan yazıyorum.',
      };
    }
    return {
      type: 'text',
      text: isGroup ? 'Ben de varım 🙌' : 'Tamam, yaz bana.',
    };
  }
}

module.exports = { MockAiService, estimateDurationMs };
