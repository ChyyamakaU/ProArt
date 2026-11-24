import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from '../config/db.js';

const ALLOWED_SQL_FILES = new Set(['schema.sql', 'seed.sql']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Executes an allow-listed SQL migration or seed script inside a transaction.
 */
async function main() {
  const filename = process.argv[2];

  if (!filename || !ALLOWED_SQL_FILES.has(filename)) {
    console.error(
      `Usage: node src/db/runSql.js <${Array.from(ALLOWED_SQL_FILES).join('|')}>`,
    );
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, filename);
  const sql = await fs.readFile(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.info(`[DB] Successfully executed ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[DB] Failed executing ${filename}:`, err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error('[DB] Unexpected error:', err.message);
  process.exit(1);
});
