import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
})

// Create tables if they don't exist
await pool.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    mpesa_receipt TEXT UNIQUE,
    phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    channel TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'in',
    account_ref TEXT,
    transaction_date TEXT,
    business_lock NUMERIC,
    savings_growth NUMERIC,
    flexible_funds NUMERIC,
    allocated INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target NUMERIC NOT NULL,
    saved NUMERIC NOT NULL DEFAULT 0,
    deadline TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`)

export default pool
