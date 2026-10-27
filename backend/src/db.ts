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
      pin_hash TEXT,
      auth_version INTEGER NOT NULL DEFAULT 0,
      business_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT UNIQUE,
      location TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

    CREATE TABLE IF NOT EXISTS pin_reset_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS pin_reset_challenges_user_created_idx
      ON pin_reset_challenges (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key_hash TEXT PRIMARY KEY,
      window_started_at TIMESTAMPTZ NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      sku TEXT,
      barcode TEXT,
      category TEXT,
      unit TEXT NOT NULL DEFAULT 'units',
      cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      wholesale_price NUMERIC(12,2),
      current_stock INTEGER NOT NULL DEFAULT 0,
      reorder_threshold INTEGER NOT NULL DEFAULT 0,
      supplier_name TEXT,
      expiry_date DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      reason TEXT,
      notes TEXT,
      previous_quantity INTEGER NOT NULL DEFAULT 0,
      new_quantity INTEGER NOT NULL DEFAULT 0,
      created_by_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reference TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receipt_number TEXT NOT NULL UNIQUE,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
      change_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      cogs NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
      customer_name TEXT,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      unit_cost NUMERIC(12,2) NOT NULL,
      subtotal NUMERIC(12,2) NOT NULL,
      cogs NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx
      ON auth_rate_limits (window_started_at);

    CREATE UNIQUE INDEX IF NOT EXISTS products_user_sku_idx
      ON products (user_id, lower(sku))
      WHERE sku IS NOT NULL AND sku <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS products_user_barcode_idx
      ON products (user_id, lower(barcode))
      WHERE barcode IS NOT NULL AND barcode <> '';
    CREATE INDEX IF NOT EXISTS products_user_active_idx
      ON products (user_id, active, updated_at DESC);
    CREATE INDEX IF NOT EXISTS stock_movements_product_created_idx
      ON stock_movements (product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS sales_user_created_idx
      ON sales (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS sale_items_sale_idx
      ON sale_items (sale_id);
  `)
  // Migrations — add columns that may be missing from older table versions
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS business_photo TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_cert_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS business_type TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
    UPDATE users SET pin_hash = '' WHERE pin_hash IS NULL;
    ALTER TABLE users ALTER COLUMN pin_hash SET DEFAULT '';
    ALTER TABLE users ALTER COLUMN pin_hash SET NOT NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'in';
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_ref TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_date TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS business_lock NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS savings_growth NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS flexible_funds NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS allocated INTEGER NOT NULL DEFAULT 1;
  `).catch((e: any) => console.warn('[db] Migration warning:', e.message))

  // Fix legacy schema: old deployments had password_hash NOT NULL; drop the constraint
  await pool.query(`
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  `).catch(() => {/* column may not exist on fresh DBs — safe to ignore */})

  // Ensure email and pin_hash allow nulls
  await pool.query(`
    ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  `).catch(() => {})
  console.log('[db] Tables ready')
} catch (err: any) {
  console.error('[db] Failed to initialize tables:', err.message)
}

export default pool
