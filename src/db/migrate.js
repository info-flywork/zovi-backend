'use strict';

const fs = require('fs');
const path = require('path');
const { getPool, query } = require('../config/database');
const { logger } = require('../utils/logger');

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function appliedSet() {
  const rows = await query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

/** Strip SQL line comments and split into executable statements. */
function parseStatements(sql) {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runMigrations({ exit = false } = {}) {
  const dir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await ensureMigrationsTable();
  const done = await appliedSet();
  const pool = getPool();
  let applied = 0;

  for (const file of files) {
    if (done.has(file)) continue;

    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, 'utf8');
    const statements = parseStatements(sql);
    logger.info('migration_apply', { file, statements: statements.length });

    if (statements.length === 0) {
      throw new Error(`Migration ${file} has no executable statements`);
    }

    const connection = await pool.getConnection();
    try {
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.query(
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [file],
      );
      applied += 1;
      logger.info('migration_ok', { file });
    } catch (err) {
      logger.error('migration_failed', { file, err });
      throw err;
    } finally {
      connection.release();
    }
  }

  if (applied > 0) {
    logger.info('migrations_complete', { applied });
  }
  if (exit) process.exit(0);
}

if (require.main === module) {
  runMigrations({ exit: true }).catch((err) => {
    logger.error('migrations_aborted', err);
    process.exit(1);
  });
}

module.exports = { runMigrations };
