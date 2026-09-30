import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.error('[db] ERROR: DATABASE_URL is not set. Database features will not work.')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
})

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      pin_hash TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT UNIQUE,
      location TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otp_sessions (
      phone TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      identifier TEXT NOT NULL,
      label TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(type, identifier)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      target NUMERIC NOT NULL,
      saved NUMERIC NOT NULL DEFAULT 0,
      deadline TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  // Migrations — add columns that may be missing from older table versions
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS business_photo TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_cert_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS business_type TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'in';
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_ref TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_date TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS business_lock NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS savings_growth NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS flexible_funds NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS allocated INTEGER NOT NULL DEFAULT 1;
  `).catch((e: any) => console.warn('[db] Migration warning:', e.message))
  console.log('[db] Tables ready')
} catch (err: any) {
  console.error('[db] Failed to initialize tables:', err.message)
}

export default pool
