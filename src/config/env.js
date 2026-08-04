'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'zovi-7a4a7',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },
  bunny: {
    storageZone: process.env.BUNNY_STORAGE_ZONE || '',
    storageApiKey: process.env.BUNNY_STORAGE_API_KEY || '',
    cdnHost: process.env.BUNNY_CDN_HOST || '',
    storageHost: process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  suno: {
    apiKey: process.env.SUNO_API_KEY || '',
    callbackUrl:
      process.env.SUNO_CALLBACK_URL ||
      'https://example.com/music/suno/callback',
    baseUrl: process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org',
  },
  oneSignal: {
    appId:
      process.env.ONE_SIGNAL_APP_ID ||
      process.env.ONESIGNAL_APP_ID ||
      '',
    restApiKey:
      process.env.ONE_SIGNAL_REST_API_KEY ||
      process.env.ONESIGNAL_REST_API_KEY ||
      '',
  },
};

module.exports = { env };
