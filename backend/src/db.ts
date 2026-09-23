import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../../tengabiz.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    mpesa_receipt TEXT UNIQUE,
    phone TEXT NOT NULL,
    amount REAL NOT NULL,
    channel TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'in',
    account_ref TEXT,
    transaction_date TEXT,
    business_lock REAL,
    savings_growth REAL,
    flexible_funds REAL,
    allocated INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target REAL NOT NULL,
    saved REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

export default db
