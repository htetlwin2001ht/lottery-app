import pg from 'pg';
import { config } from './config.js';

// A single shared connection pool. For 100k+ users you scale by running
// multiple instances behind a load balancer, each with its own pool.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Most managed Postgres (Railway/Render/Supabase) need SSL in production.
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
