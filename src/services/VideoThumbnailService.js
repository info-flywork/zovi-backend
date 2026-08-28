'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { logger } = require('../utils/logger');

ffmpeg.setFfmpegPath(ffmpegPath);

const TIMEOUT_MS = 8_000;
const CAPTURE_AT_SECONDS = 1;
const MAX_HEIGHT = 720;

/**
 * Grabs a single poster-frame JPEG from an uploaded video buffer. Never
 * throws — a failed/slow extraction just means the story falls back to the
 * client's own video-frame decode, same as before this existed.
 * @returns {Promise<Buffer|null>}
 */
async function extractThumbnail(buffer) {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `zovi_vid_${randomUUID()}.mp4`);
  const outputName = `zovi_thumb_${randomUUID()}.jpg`;
  const outputPath = path.join(tmpDir, outputName);

  try {
    await fs.writeFile(inputPath, buffer);

    let command;
    await Promise.race([
      new Promise((resolve, reject) => {
        command = ffmpeg(inputPath)
          .on('end', resolve)
          .on('error', reject)
          .screenshots({
            timestamps: [CAPTURE_AT_SECONDS],
            filename: outputName,
            folder: tmpDir,
            size: `?x${MAX_HEIGHT}`,
          });
      }),
      new Promise((_, reject) =>
        setTimeout(() => {
          try {
            command?.kill('SIGKILL');
          } catch (_) {}
          reject(new Error('thumbnail_timeout'));
        }, TIMEOUT_MS),
      ),
    ]);

    return await fs.readFile(outputPath);
  } catch (err) {
    logger.warn('video_thumbnail_failed', { message: err.message });
    return null;
  } finally {
    await fs.rm(inputPath, { force: true }).catch(() => {});
    await fs.rm(outputPath, { force: true }).catch(() => {});
  }
}

module.exports = { extractThumbnail };
