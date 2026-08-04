'use strict';

const { env } = require('../config/env');

const STYLE_HINTS = {
  modern:
    'clean modern vector sticker style, rounded shapes, smooth gradients, soft highlights',
  sketch:
    'hand-drawn sketch sticker style, expressive lines, textured strokes, subtle shading',
  colorful:
    'vivid colorful sticker style, saturated palette, playful outlines, high contrast',
  anime:
    'anime-inspired sticker style, cel shading, expressive eyes, dynamic lines',
};

class StickerGenerationService {
  get isConfigured() {
    return Boolean(env.openai.apiKey);
  }

  _buildPrompt({ style, title, description }) {
    const styleHint = STYLE_HINTS[style] || STYLE_HINTS.modern;
    const safeTitle = title || 'Custom Sticker';
    const safeDescription = description || '';

    return [
      'Create a premium app sticker from the provided photo subject.',
      'Keep the recognizable identity and key facial/object traits from the input photo.',
      `Visual style: ${styleHint}.`,
      'Match a social app "Zovi Stamps" look: bold silhouette, polished finish, clean edges, no clutter.',
      'Output must be a single centered sticker subject with transparent background.',
      'Add a subtle white outline suitable for chat sticker usage.',
      `Sticker name/context: ${safeTitle}.`,
      `User description/context: ${safeDescription}.`,
      'No text, no watermark, no logo, no extra scene background.',
    ].join(' ');
  }

  async generateFromPhoto({ imageBuffer, mimeType, style, title, description }) {
    if (!this.isConfigured) {
      const err = new Error('OpenAI is not configured');
      err.code = 'OPENAI_NOT_CONFIGURED';
      err.status = 503;
      throw err;
    }

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append(
      'image',
      new Blob([imageBuffer], { type: mimeType || 'image/jpeg' }),
      'source-image.jpg',
    );
    formData.append('size', '1024x1024');
    formData.append('output_format', 'png');
    formData.append('prompt', this._buildPrompt({ style, title, description }));

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
      },
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error('Sticker generation failed');
      err.code = 'OPENAI_IMAGE_FAILED';
      err.status = 502;
      err.meta = payload;
      throw err;
    }

    const base64Image = payload?.data?.[0]?.b64_json;
    if (!base64Image) {
      const err = new Error('OpenAI image payload missing');
      err.code = 'OPENAI_IMAGE_INVALID_RESPONSE';
      err.status = 502;
      throw err;
    }

    return {
      buffer: Buffer.from(base64Image, 'base64'),
      mimeType: 'image/png',
    };
  }
}

module.exports = { StickerGenerationService };
