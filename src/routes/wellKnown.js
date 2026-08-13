'use strict';

/**
 * Deep-link hosting served straight from the API host (zovi.fly-work.com), so
 * no separate domain / static server is needed:
 *   GET /.well-known/apple-app-site-association  -> iOS Universal Links
 *   GET /.well-known/assetlinks.json             -> Android App Links
 *   GET /u/:handle                               -> fallback landing page
 *
 * Set ANDROID_CERT_SHA256 in .env to the app-signing SHA-256 fingerprint(s)
 * (comma-separated for multiple, e.g. debug + release). Until set, Android App
 * Links won't auto-verify but nothing breaks.
 */

const express = require('express');

const IOS_APP_ID = 'JK42R39DT5.com.flywork.zovi';
const ANDROID_PACKAGE = 'com.flywork.zovi';

const router = express.Router();

function androidFingerprints() {
  return String(process.env.ANDROID_CERT_SHA256 || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// iOS Universal Links. No file extension, must be application/json, no redirect.
router.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.type('application/json').json({
    applinks: {
      apps: [],
      details: [{ appID: IOS_APP_ID, paths: ['/u/*'] }],
    },
  });
});

// Android App Links verification.
router.get('/.well-known/assetlinks.json', (_req, res) => {
  res.type('application/json').json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: androidFingerprints(),
      },
    },
  ]);
});

function landingHtml(handle) {
  const safe = handle.replace(/[^a-zA-Z0-9_.-]/g, '');
  const label = safe ? `@${safe}` : 'zovi';
  const openHref = safe
    ? `zovi://u/${encodeURIComponent(safe)}`
    : 'https://zovi.fly-work.com';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open in Zovi</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
      font-family:"Avenir Next","Segoe UI",sans-serif; color:#2b2118;
      background:radial-gradient(circle at top left,#ffe0d3 0%,transparent 45%),
        radial-gradient(circle at bottom right,#d9efe8 0%,transparent 40%),#f7f4ef; }
    .card { width:min(420px,100%); text-align:center; }
    h1 { margin:0 0 8px; font-size:2rem; letter-spacing:-0.04em; }
    p { margin:0 0 24px; color:#6f6256; line-height:1.4; }
    .handle { display:inline-block; margin-bottom:20px; padding:8px 14px; border-radius:999px;
      background:rgba(43,33,24,0.06); font-weight:600; }
    a.button { display:inline-flex; align-items:center; justify-content:center; min-width:220px;
      height:52px; padding:0 20px; border-radius:999px; background:#2b2118; color:#fff;
      text-decoration:none; font-weight:600; }
    .stores { margin-top:16px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
    .stores a { color:#ff6a3d; font-weight:600; text-decoration:none; }
  </style>
</head>
<body>
  <main class="card">
    <h1>zovi</h1>
    <p>Open this profile in the app. If Zovi is installed, it should launch automatically.</p>
    <div class="handle">${label}</div>
    <a class="button" href="${openHref}">Open in Zovi</a>
    <div class="stores">
      <a href="https://apps.apple.com/">App Store</a>
      <a href="https://play.google.com/store">Google Play</a>
    </div>
  </main>
</body>
</html>`;
}

router.get('/u/:handle', (req, res) => {
  res.type('html').send(landingHtml(String(req.params.handle || '')));
});

router.get('/u', (_req, res) => {
  res.type('html').send(landingHtml(''));
});

module.exports = router;
