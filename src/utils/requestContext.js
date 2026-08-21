'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const SUPPORTED = new Set([
  'tr', 'en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'hi', 'ko', 'ja', 'zh',
]);

const storage = new AsyncLocalStorage();

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  const short = raw.split('-')[0];
  if (SUPPORTED.has(raw)) return raw;
  if (SUPPORTED.has(short)) return short;
  return 'en';
}

function parseAcceptLanguage(header) {
  const raw = String(header || '').trim();
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim().split(';')[0]?.trim();
  return first || null;
}

function requestContextMiddleware(req, _res, next) {
  const fromHeader = parseAcceptLanguage(req.headers['accept-language']);
  const fromQuery = req.query?.locale;
  const locale = normalizeLocale(fromHeader || fromQuery || 'en');
  storage.run({ locale }, () => next());
}

function getRequestLocale(fallback = 'en') {
  return storage.getStore()?.locale || normalizeLocale(fallback);
}

function runWithLocale(locale, fn) {
  return storage.run({ locale: normalizeLocale(locale) }, fn);
}

module.exports = {
  requestContextMiddleware,
  getRequestLocale,
  runWithLocale,
  normalizeLocale,
};
