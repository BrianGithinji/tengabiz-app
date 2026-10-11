import 'dotenv/config'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

const { default: pool } = await import('./db.js')
const { allocate } = await import('./daraja/callback.js')

const demoPhone = '254700000001'
const demoPin = '1234'
const demoBusiness = 'Mwangaza Fresh Produce'
const demoOwner = 'Amina Wanjiku'
const shortcode = process.env.MPESA_STK_SHORTCODE
const reset = process.argv.includes('--reset')

if (!shortcode) {
  throw new Error('MPESA_STK_SHORTCODE is required to seed the demo channel')
}

const pinHash = await bcrypt.hash(demoPin, 10)
const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [demoPhone])
const userId = existing.rows[0]?.id ?? randomUUID()

if (existing.rows.length > 0) {
  await pool.query(
    `UPDATE users
     SET email = $1, pin_hash = $2, business_name = $3, owner_name = $4,
         business_type = $5, location = $6, description = $7
     WHERE id = $8`,
    [
      'amina.wanjiku@demo.example',
      pinHash,
      demoBusiness,
      demoOwner,
      'Fresh produce retail',
      'Kisumu, Kenya',
      'A neighborhood produce shop serving fresh fruit, vegetables, and staples.',
      userId,
    ]
  )
} else {
  await pool.query(
    `INSERT INTO users
       (id, email, pin_hash, business_name, owner_name, phone, business_type, location, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      'amina.wanjiku@demo.example',
      pinHash,
      demoBusiness,
      demoOwner,
      demoPhone,
      'Fresh produce retail',
      'Kisumu, Kenya',
      'A neighborhood produce shop serving fresh fruit, vegetables, and staples.',
    ]
  )
}

await pool.query(
  `INSERT INTO channels (id, user_id, type, identifier, label, active)
   VALUES ($1, $2, 'paybill', $3, 'M-Pesa business paybill', TRUE)
   ON CONFLICT (type, identifier)
   DO UPDATE SET user_id = EXCLUDED.user_id, label = EXCLUDED.label, active = TRUE`,
  [randomUUID(), userId, shortcode]
)

await pool.query(
  `INSERT INTO savings_goals (id, user_id, name, target, saved, deadline)
   VALUES ($1, $2, 'Cold-room stock fund', 120000, 38500, $3)
   ON CONFLICT DO NOTHING`,
  [randomUUID(), userId, '2026-12-31']
)

const transactions = [
  { date: '2026-09-29T09:14:00+03:00', amount: 450, customer: 'Wanjiru Kamau', phone: '254700000101', receipt: 'SIT9A4K2L1', ref: 'INV-1041', channel: 'stk' },
  { date: '2026-09-30T12:40:00+03:00', amount: 100, customer: 'Brian Otieno', phone: '254700000102', receipt: 'SJU3B7M5N2', ref: 'INV-1042', channel: 'c2b' },
  { date: '2026-10-01T08:55:00+03:00', amount: 1200, customer: 'Amina Hassan', phone: '254700000103', receipt: 'SKV8C2P6Q3', ref: 'INV-1043', channel: 'stk' },
  { date: '2026-10-02T17:20:00+03:00', amount: 317, customer: 'Kevin Mwangi', phone: '254700000104', receipt: 'SLW1D9R4S4', ref: 'INV-1044', channel: 'c2b' },
  { date: '2026-10-03T11:05:00+03:00', amount: 2500, customer: 'Faith Chebet', phone: '254700000105', receipt: 'SMX5E3T7U5', ref: 'INV-1045', channel: 'stk' },
  { date: '2026-10-04T14:30:00+03:00', amount: 250, customer: 'Peter Njoroge', phone: '254700000106', receipt: 'SNY2F8V1W6', ref: 'INV-1046', channel: 'c2b' },
  { date: '2026-10-05T10:10:00+03:00', amount: 3800, customer: 'Grace Akinyi', phone: '254700000107', receipt: 'SOZ6G4X9Y7', ref: 'INV-1047', channel: 'stk' },
  { date: '2026-10-06T16:45:00+03:00', amount: 750, customer: 'Salim Juma', phone: '254700000108', receipt: 'SPA7H1Z3A8', ref: 'INV-1048', channel: 'c2b' },
  { date: '2026-10-08T09:30:00+03:00', amount: 1850, customer: 'Mercy Wambui', phone: '254700000109', receipt: 'SQB4J5C8B9', ref: 'INV-1049', channel: 'stk' },
  { date: '2026-10-09T13:15:00+03:00', amount: 500, customer: 'Daniel Kiprop', phone: '254700000110', receipt: 'SRC9K2D6E0', ref: 'INV-1050', channel: 'c2b' },
  { date: '2026-10-10T18:00:00+03:00', amount: 6400, customer: 'Lucy Nyambura', phone: '254700000111', receipt: 'SSD3L7F1G1', ref: 'INV-1051', channel: 'stk' },
  { date: '2026-10-12T08:20:00+03:00', amount: 900, customer: 'Joseph Odhiambo', phone: '254700000112', receipt: 'STE8M4H5J2', ref: 'INV-1052', channel: 'c2b' },
]

if (reset) {
  await pool.query('DELETE FROM transactions WHERE user_id = $1', [userId])
}

for (const tx of transactions) {
  const split = allocate(tx.amount)

  await pool.query(
    `INSERT INTO transactions
       (id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref,
        transaction_date, business_lock, savings_growth, flexible_funds, allocated, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'in', $7, $8, $9, $10, $11, 1, $12)
     ON CONFLICT (mpesa_receipt) DO NOTHING`,
    [
      randomUUID(),
      userId,
      tx.receipt,
      tx.phone,
      tx.amount,
      tx.channel,
      `${tx.ref} - ${tx.customer}`,
      tx.date,
      split.businessLock,
      split.savingsGrowth,
      split.flexibleFunds,
      tx.date,
    ]
  )
}

const { rows } = await pool.query(
  `SELECT
     COALESCE(SUM(amount), 0) AS total,
     COALESCE(SUM(business_lock), 0) AS lock,
     COALESCE(SUM(savings_growth), 0) AS savings,
     COALESCE(SUM(flexible_funds), 0) AS available,
     COUNT(*) AS count
   FROM transactions
   WHERE user_id = $1 AND type = 'in'`,
  [userId]
)
const totals = rows[0]
const total = Number(totals.total)
const lock = Number(totals.lock)
const savings = Number(totals.savings)
const available = Number(totals.available)

const allocationDifference = Math.abs(lock + savings + available - total)
if (allocationDifference > transactions.length) {
  throw new Error(`Allocation verification failed: ${lock} + ${savings} + ${available} != ${total}`)
}

console.log(`demo user ${userId}`)
console.log(`transactions ${totals.count}`)
console.log(`totals KES ${total} | lock ${lock} | savings ${savings} | available ${available}`)
console.log(`allocation verified ${lock + savings + available} vs ${total} (difference ${allocationDifference} KES from per-row rounding)`)

await pool.end()
