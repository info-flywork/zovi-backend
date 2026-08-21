'use strict';

const mysql = require('mysql2/promise');
const { env } = require('./env');
const { logger } = require('../utils/logger');

/** @type {import('mysql2/promise').Pool | null} */
let pool = null;

function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // DATETIME columns are stored/read as UTC wall-clock.
    timezone: 'Z',
    dateStrings: false,
  });

  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  logger.info('mysql_pool_created', {
    host: env.db.host,
    port: env.db.port,
    database: env.db.database,
  });

  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * DB health check — SELECT 1 + metadata.
 * @returns {Promise<{ok: boolean, latencyMs: number, database?: string, error?: string}>}
 */
async function healthCheck() {
  const started = Date.now();
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT 1 AS ok, DATABASE() AS db, NOW() AS server_time');
    const latencyMs = Date.now() - started;
    const row = rows[0];
    logger.info('db_health_ok', { latencyMs, database: row.db });
    return {
      ok: true,
      latencyMs,
      database: row.db,
      serverTime: row.server_time,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    logger.error('db_health_failed', err);
    return {
      ok: false,
      latencyMs,
      error: err.message,
      code: err.code,
    };
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
  logger.info('mysql_pool_closed');
}

module.exports = {
  getPool,
  query,
  withTransaction,
  healthCheck,
  closePool,
};
