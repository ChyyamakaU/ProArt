import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

/**
 * Determines whether SSL should be enabled for PostgreSQL connections.
 * Supports explicit DATABASE_SSL flag as well as standard sslmode URL query parameters.
 *
 * @returns {boolean | { rejectUnauthorized: boolean }}
 */
function resolveSslConfig() {
  const urlRequiresSsl = /sslmode=(require|verify-ca|verify-full)/i.test(env.DATABASE_URL);
  if (env.DATABASE_SSL || urlRequiresSsl) {
    return {
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    };
  }
  return false;
}

/**
 * Shared PostgreSQL connection pool with defensive timeouts and cloud SSL support.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: resolveSslConfig(),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  allowExitOnIdle: env.NODE_ENV === 'test',
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected idle PostgreSQL client error:', err.message);
});

/**
 * Executes a strictly parameterized SQL query via the shared pool.
 *
 * @param {string} text - Parameterized SQL statement ($1, $2, ...).
 * @param {unknown[]} [params=[]] - Bound query parameter values.
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client.query.bind(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Verifies live database connectivity for readiness/health probes.
 *
 * @returns {Promise<{ ok: boolean, latencyMs: number }>}
 */
export async function checkDatabaseHealth() {
  const startedAt = Date.now();
  await pool.query('SELECT 1');
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
  };
}

let isClosing = false;

/**
 * Gracefully drains and closes the PostgreSQL pool.
 * Idempotent so duplicate signals do not throw.
 *
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (isClosing) {
    return;
  }
  isClosing = true;
  await pool.end();
}

/**
 * Registers SIGINT and SIGTERM handlers to drain the DB pool cleanly on exit.
 *
 * @param {() => Promise<void>} [beforeClose] - Optional hook (e.g., closing HTTP server first).
 */
export function registerGracefulShutdown(beforeClose) {
  let shuttingDown = false;

  const handleSignal = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.info(`[SHUTDOWN] Received ${signal}. Closing resources gracefully...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[SHUTDOWN] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    try {
      if (typeof beforeClose === 'function') {
        await beforeClose();
      }
      await closePool();
      console.info('[SHUTDOWN] PostgreSQL pool closed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[SHUTDOWN] Error during graceful shutdown:', err.message);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void handleSignal('SIGINT');
  });
  process.once('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });
}
