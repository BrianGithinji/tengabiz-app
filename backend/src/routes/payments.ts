import { Router } from 'express'
import {
  handleStkCallback,
  handleC2BValidation,
  handleC2BConfirmation,
} from '../daraja/callback.js'
import { allocate } from '../daraja/callback.js'
import { randomUUID } from 'crypto'
import pool from '../db.js'

const router = Router()

// Safaricom rejects callback URLs containing the word "mpesa"
// These are registered via POST /api/mpesa/register-c2b
router.post('/stk-callback', handleStkCallback)
router.post('/c2b-validation', handleC2BValidation)
router.post('/c2b-confirmation', handleC2BConfirmation)

// ── Internal simulation routes (no blocked keywords in path) ──────────────────
// Used for local demo / pitch simulation — mirrors exact Daraja C2B logic

// POST /api/internal-payment/trigger-validation
// Mirrors Safaricom validation handshake — always accepts
router.post('/trigger-validation', (req, res) => {
  const { TransAmount, MSISDN, BillRefNumber } = req.body ?? {}
  console.log(`[Sim Validation] Phone: ${MSISDN}, Amount: ${TransAmount}, Ref: ${BillRefNumber}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
})

// POST /api/internal-payment/trigger-confirmation
// Mirrors Safaricom confirmation — runs full 60/20/20 split and persists
router.post('/trigger-confirmation', async (req, res) => {
  const { TransID, TransAmount, MSISDN } = req.body ?? {}
  const amount = Number(TransAmount)

  if (!amount || !TransID || !MSISDN) {
    res.status(400).json({ error: 'TransID, TransAmount and MSISDN are required' })
    return
  }

  const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

  await pool.query(
    `INSERT INTO transactions
       (id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref,
        transaction_date, business_lock, savings_growth, flexible_funds, allocated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (mpesa_receipt) DO NOTHING`,
    [randomUUID(), null, TransID, MSISDN, amount, 'sim', 'in', null,
     new Date().toISOString(), businessLock, savingsGrowth, flexibleFunds, 1]
  ).catch(err => console.error('[Sim Confirmation] DB error:', err.message))

  console.log(`[Sim Confirmation] KES ${amount} → Lock ${businessLock} | Savings ${savingsGrowth} | Available ${flexibleFunds}`)
  res.json({
    ResultCode: 0, ResultDesc: 'Accepted',
    split: { businessLock, savings: savingsGrowth, available: flexibleFunds },
  })
})

export default router
