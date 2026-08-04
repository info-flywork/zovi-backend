'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { env } = require('./env');
const { logger } = require('../utils/logger');

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const credPath = env.firebase.credentialsPath
    ? path.resolve(process.cwd(), env.firebase.credentialsPath)
    : '';

  if (credPath && fs.existsSync(credPath)) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(credPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: env.firebase.projectId,
    });
    logger.info('firebase_admin_initialized', {
      mode: 'service_account',
      projectId: env.firebase.projectId,
    });
  } else {
    try {
      admin.initializeApp({
        projectId: env.firebase.projectId,
      });
      logger.warn('firebase_admin_initialized_without_credentials', {
        projectId: env.firebase.projectId,
        hint: 'Place serviceAccount.json and set GOOGLE_APPLICATION_CREDENTIALS for token verify',
      });
    } catch (err) {
      logger.error('firebase_admin_init_failed', err);
      throw err;
    }
  }

  initialized = true;
  return admin;
}

function getAuth() {
  initFirebase();
  return admin.auth();
}

/**
 * @param {string} idToken
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
async function verifyIdToken(idToken) {
  return getAuth().verifyIdToken(idToken, true);
}

module.exports = {
  initFirebase,
  getAuth,
  verifyIdToken,
  admin,
};
