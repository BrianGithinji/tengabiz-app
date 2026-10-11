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
  { receipt: 'DEMOA7K2P1', amount: 1250, daysAgo: 1, hour: 8, minute: 20, channel: 'stk', ref: 'Order 1042' },
  { receipt: 'DEMOB8L3Q2', amount: 2800, daysAgo: 2, hour: 10, minute: 5, channel: 'c2b', ref: 'Wholesale crates' },
  { receipt: 'DEMOC9M4R3', amount: 750, daysAgo: 3, hour: 13, minute: 40, channel: 'stk', ref: 'Fruit basket' },
  { receipt: 'DEMOD2N5S4', amount: 3400, daysAgo: 4, hour: 16, minute: 15, channel: 'c2b', ref: 'Restaurant order' },
  { receipt: 'DEMOE3P6T5', amount: 1800, daysAgo: 6, hour: 7, minute: 55, channel: 'stk', ref: 'Morning stock' },
  { receipt: 'DEMOF4Q7U6', amount: 6200, daysAgo: 7, hour: 18, minute: 25, channel: 'c2b', ref: 'Hotel supply' },
  { receipt: 'DEMOG5R8V7', amount: 950, daysAgo: 9, hour: 11, minute: 10, channel: 'stk', ref: 'Order 1028' },
  { receipt: 'DEMOH6S9W8', amount: 2150, daysAgo: 10, hour: 14, minute: 35, channel: 'c2b', ref: 'Market stall' },
  { receipt: 'DEMOJ7T2X9', amount: 1450, daysAgo: 12, hour: 19, minute: 5, channel: 'stk', ref: 'Evening sales' },
  { receipt: 'DEMOK8U3Y0', amount: 3900, daysAgo: 13, hour: 20, minute: 10, channel: 'c2b', ref: 'Catering deposit' },
]

for (const tx of transactions) {
  const date = new Date()
  date.setDate(date.getDate() - tx.daysAgo)
  date.setHours(tx.hour, tx.minute, 0, 0)
  const split = allocate(tx.amount)

  await pool.query(
    `INSERT INTO transactions
       (id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref,
        transaction_date, business_lock, savings_growth, flexible_funds, allocated)
     VALUES ($1, $2, $3, $4, $5, $6, 'in', $7, $8, $9, $10, $11, 1)
     ON CONFLICT (mpesa_receipt) DO NOTHING`,
    [
      randomUUID(),
      userId,
      tx.receipt,
      '254711000001',
      tx.amount,
      tx.channel,
      tx.ref,
      date.toISOString(),
      split.businessLock,
      split.savingsGrowth,
      split.flexibleFunds,
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

if (lock + savings + available !== total) {
  throw new Error(`Allocation verification failed: ${lock} + ${savings} + ${available} != ${total}`)
}

console.log(`demo user ${userId}`)
console.log(`transactions ${totals.count}`)
console.log(`totals KES ${total} | lock ${lock} | savings ${savings} | available ${available}`)
console.log(`allocation verified ${lock + savings + available} = ${total}`)

await pool.end()
