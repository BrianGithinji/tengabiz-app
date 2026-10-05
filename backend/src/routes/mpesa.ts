import { Router } from 'express'
import { stkPush, stkQuery } from '../daraja/stk.js'
import { registerC2BUrls, queryTransactionStatus } from '../daraja/c2b.js'
import {
  handleTransactionResult,
  handleTransactionTimeout,
  allocate,
} from '../daraja/callback.js'
import { validate, stkPushSchema, stkQuerySchema, transactionStatusSchema } from '../middleware/validate.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import pool from '../db.js'
import { randomUUID } from 'crypto'

// ── In-memory recent-transactions feed (last 50) ──────────────────────────────
export interface RecentTx {
  id: string
  transId: string
  phone: string
  amount: number
  businessLock: number
  savings: number
  available: number
  timestamp: string
}
const recentTxFeed: RecentTx[] = []
export function pushToFeed(tx: RecentTx) {
  recentTxFeed.unshift(tx)
  if (recentTxFeed.length > 50) recentTxFeed.pop()
}

// ── In-memory running balances (simulation layer) ─────────────────────────────
const balances = { businessLock: 0, savings: 0, available: 0 }

const router = Router()

// ── Outbound (frontend → backend → Daraja) ────────────────────────────────────

// Prompt a customer's phone to pay
// POST /api/mpesa/stk-push
// Body: { phone, amount, accountRef, description }
router.post('/stk-push', validate(stkPushSchema), async (req, res) => {
  try {
    const result = await stkPush(req.body)
    res.json(result)
  } catch (err: any) {
    const msg = err?.response?.data ?? err?.message ?? 'STK push failed'
    res.status(502).json({ error: msg })
  }
})

// Check if an STK push was completed
// POST /api/mpesa/stk-query
// Body: { checkoutRequestId }
router.post('/stk-query', validate(stkQuerySchema), async (req, res) => {
  try {
    const result = await stkQuery(req.body.checkoutRequestId)
    res.json(result)
  } catch (err: any) {
    const msg = err?.response?.data ?? err?.message ?? 'STK query failed'
    res.status(502).json({ error: msg })
  }
})

// Register C2B callback URLs with Safaricom (call once per environment)
// POST /api/mpesa/register-c2b
router.post('/register-c2b', async (_req, res) => {
  try {
    const result = await registerC2BUrls()
    res.json(result)
  } catch (err: any) {
    const darajaError = err?.response?.data
    const msg = err?.message ?? 'C2B registration failed'
    console.error('[register-c2b] Error:', JSON.stringify(darajaError ?? msg))
    res.status(502).json({ error: msg, daraja: darajaError ?? null })
  }
})

// Query a specific transaction by M-PESA receipt number
// POST /api/mpesa/transaction-status
// Body: { transactionId }
router.post('/transaction-status', validate(transactionStatusSchema), async (req, res) => {
  try {
    const result = await queryTransactionStatus(req.body.transactionId)
    res.json(result)
  } catch (err: any) {
    const msg = err?.response?.data ?? err?.message ?? 'Transaction status query failed'
    res.status(502).json({ error: msg })
  }
})

// GET /api/mpesa/transactions — scoped to logged-in user
router.get('/transactions', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
    [req.userId]
  )
  res.json(rows)
})

// GET /api/mpesa/summary — scoped to logged-in user
router.get('/summary', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount), 0) AS total_in,
      COALESCE(SUM(business_lock), 0) AS total_business_lock,
      COALESCE(SUM(savings_growth), 0) AS total_savings,
      COALESCE(SUM(flexible_funds), 0) AS total_flexible,
      COUNT(*) AS tx_count
    FROM transactions WHERE type = 'in' AND user_id = $1
  `, [req.userId])
  res.json(rows[0])
})

// ── Inbound (Daraja → backend callbacks) ─────────────────────────────────────
// STK + C2B callbacks are on /api/payments/* to avoid Safaricom rejecting URLs with "mpesa"

router.post('/transaction-result', handleTransactionResult)
router.post('/transaction-timeout', handleTransactionTimeout)

// ── Daraja C2B canonical webhook aliases ──────────────────────────────────────
// Safaricom posts here during the preliminary handshake before charging the customer.
// Must respond HTTP 200 with ResultCode 0 within ~5 s or Safaricom cancels the transaction.

// POST /api/mpesa/validation
router.post('/validation', (req, res) => {
  const { TransAmount, MSISDN, BillRefNumber } = req.body ?? {}
  console.log(`[C2B Validation] Phone: ${MSISDN}, Amount: ${TransAmount}, Ref: ${BillRefNumber}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
})

// POST /api/mpesa/confirmation  — primary 60/20/20 split engine hook
router.post('/confirmation', async (req, res) => {
  const { TransID, TransAmount, MSISDN } = req.body ?? {}

  const amount = Number(TransAmount)
  if (!amount || !TransID || !MSISDN) {
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' })   // always ACK Safaricom
    return
  }

  const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

  // Update running simulation balances
  balances.businessLock += businessLock
  balances.savings      += savingsGrowth
  balances.available    += flexibleFunds

  // Build and prepend to the live feed
  const entry: RecentTx = {
    id:           randomUUID(),
    transId:      TransID,
    phone:        MSISDN,
    amount,
    businessLock,
    savings:      savingsGrowth,
    available:    flexibleFunds,
    timestamp:    new Date().toISOString(),
  }
  pushToFeed(entry)

  // Persist to DB (best-effort — don't block the Safaricom ACK)
  pool.query(
    `INSERT INTO transactions
       (id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref,
        transaction_date, business_lock, savings_growth, flexible_funds, allocated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (mpesa_receipt) DO NOTHING`,
    [entry.id, null, TransID, MSISDN, amount, 'c2b', 'in', null,
     new Date().toISOString(), businessLock, savingsGrowth, flexibleFunds, 1]
  ).catch(err => console.error('[C2B Confirmation] DB error:', err.message))

  console.log(`[C2B Confirmation] KES ${amount} → Lock ${businessLock} | Savings ${savingsGrowth} | Available ${flexibleFunds}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
})

// GET /api/mpesa/recent-transactions — frontend polls this for live feed
router.get('/recent-transactions', (_req, res) => {
  res.json({ balances, transactions: recentTxFeed })
})

export default router
