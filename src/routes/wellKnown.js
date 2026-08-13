'use strict';

/**
 * Deep-link hosting served from the API host (zovi.fly-work.com):
 *   GET /.well-known/apple-app-site-association  -> iOS Universal Links
 *   GET /.well-known/assetlinks.json             -> Android App Links
 *   GET /u/:handle                               -> fallback landing page
 *   GET /images/*                                -> landing assets
 *
 * Set ANDROID_CERT_SHA256 in .env (comma-separated for debug + release).
 */

const path = require('path');
const express = require('express');

const IOS_APP_ID = 'JK42R39DT5.com.flywork.zovi';
const ANDROID_PACKAGE = 'com.flywork.zovi';
const publicDir = path.join(__dirname, '../../public');
const landingFile = path.join(publicDir, 'u', 'index.html');

const router = express.Router();

function androidFingerprints() {
  return String(process.env.ANDROID_CERT_SHA256 || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

router.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.type('application/json').json({
    applinks: {
      apps: [],
      details: [{ appID: IOS_APP_ID, paths: ['/u/*'] }],
    },
  });
});

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

router.use('/images', express.static(path.join(publicDir, 'images')));

router.get('/u/:handle', (_req, res) => {
  res.sendFile(landingFile);
});

router.get('/u', (_req, res) => {
  res.sendFile(landingFile);
});

module.exports = router;
