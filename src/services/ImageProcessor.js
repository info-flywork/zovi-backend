'use strict';

const sharp = require('sharp');
const { logger } = require('../utils/logger');

const MAX_DIMENSION = 1600;
const QUALITY = 82;

/**
 * Resize + re-encode an uploaded image before it reaches Bunny storage.
 * Cuts storage cost and upload bandwidth — delivery-time sizing (Bunny's
 * optimizer `?width=&quality=`) still applies on top of this per-screen.
 * No-op for anything that isn't an `image/*` mimetype (video passes through
 * untouched), and falls back to the original buffer if sharp can't decode it
 * (e.g. an unsupported format) rather than failing the whole upload.
 *
 * @returns {Promise<{ buffer: Buffer, mimetype: string, ext: string }>}
 */
async function resizeAndCompress(buffer, mimetype) {
  const mime = String(mimetype || '').toLowerCase();
  if (!mime.startsWith('image/')) {
    return { buffer, mimetype: mime, ext: null };
  }

  try {
    const image = sharp(buffer, { failOn: 'none' }).rotate();
    const meta = await image.metadata();
    const resized = image.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

    if (meta.hasAlpha) {
      const out = await resized.webp({ quality: QUALITY }).toBuffer();
      return { buffer: out, mimetype: 'image/webp', ext: 'webp' };
    }
    const out = await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    return { buffer: out, mimetype: 'image/jpeg', ext: 'jpg' };
  } catch (err) {
    logger.warn('image_process_failed', { mime, message: err.message });
    return { buffer, mimetype: mime, ext: null };
  }
}

module.exports = { resizeAndCompress };
