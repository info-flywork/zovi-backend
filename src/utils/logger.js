'use strict';

const { env } = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, debug: 4 };
const current = LEVELS[env.logLevel] ?? LEVELS.info;

function ts() {
  return new Date().toISOString();
}

function fmt(level, message, meta) {
  const base = {
    ts: ts(),
    level,
    msg: message,
  };
  if (meta !== undefined) {
    if (meta instanceof Error) {
      base.err = { message: meta.message, stack: meta.stack, code: meta.code };
    } else if (typeof meta === 'object' && meta !== null) {
      Object.assign(base, meta);
    } else {
      base.meta = meta;
    }
  }
  return JSON.stringify(base);
}

function write(level, message, meta) {
  if ((LEVELS[level] ?? 99) > current) return;
  const line = fmt(level, message, meta);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

const logger = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  http: (message, meta) => write('http', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};

module.exports = { logger };
