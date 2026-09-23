import { Router } from 'express'
import { stkPush, stkQuery } from '../daraja/stk.js'
import { registerC2BUrls, queryTransactionStatus } from '../daraja/c2b.js'
import {
  handleTransactionResult,
  handleTransactionTimeout,
} from '../daraja/callback.js'
import { validate, stkPushSchema, stkQuerySchema, transactionStatusSchema } from '../middleware/validate.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import pool from '../db.js'

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
    const msg = err?.response?.data ?? err?.message ?? 'C2B registration failed'
    res.status(502).json({ error: msg })
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

export default router
