// AuditPulse Server - PostgreSQL Database Client for Neon
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('⚠️ Cảnh báo: DATABASE_URL chưa được thiết lập.');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

/**
 * Executes a parameterized SQL query safely against Neon PostgreSQL.
 * NEVER concatenate raw user input into the query string!
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const _duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'test') {
    // Optional debug log
    // console.log('executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Helper to run multiple parameterized operations inside a single database transaction.
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
