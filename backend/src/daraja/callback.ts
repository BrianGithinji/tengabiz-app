import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import pool from '../db.js'

export function allocate(amount: number) {
  return {
    businessLock: Math.round(amount * 0.6),
    savingsGrowth: Math.round(amount * 0.2),
    flexibleFunds: Math.round(amount * 0.2),
  }
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`
  return digits
}

// Look up which user owns a given channel identifier (Till, Paybill shortcode, or phone)
async function resolveUser(identifier: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT user_id FROM channels WHERE identifier = $1 AND active = TRUE LIMIT 1`,
    [identifier]
  )
  return rows[0]?.user_id ?? null
}

async function insertTx(tx: {
  id: string; user_id: string | null; mpesa_receipt: string | null
  phone: string; amount: number; channel: string; type: string
  account_ref: string | null; transaction_date: string
  business_lock: number; savings_growth: number; flexible_funds: number; allocated: number
}) {
  await pool.query(
    `INSERT INTO transactions
      (id, user_id, mpesa_receipt, phone, amount, channel, type, account_ref,
       transaction_date, business_lock, savings_growth, flexible_funds, allocated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (mpesa_receipt) DO NOTHING`,
    [tx.id, tx.user_id, tx.mpesa_receipt, tx.phone, tx.amount, tx.channel,
     tx.type, tx.account_ref, tx.transaction_date, tx.business_lock,
     tx.savings_growth, tx.flexible_funds, tx.allocated]
  )
}

// ── STK Push callback ─────────────────────────────────────────────────────────
export async function handleStkCallback(req: Request, res: Response) {
  const body = req.body?.Body?.stkCallback
  if (!body) { res.status(400).json({ error: 'Invalid STK callback payload' }); return }

  const { ResultCode, ResultDesc, MerchantRequestID, CallbackMetadata } = body
  if (ResultCode !== 0) {
    console.warn(`[STK] Failed — ${ResultDesc} (MerchantRequestID: ${MerchantRequestID})`)
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); return
  }

  const items: Record<string, string | number> = {}
  for (const item of CallbackMetadata?.Item ?? []) items[item.Name] = item.Value

  const amount = Number(items['Amount'])
  const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

  // Match to user via the shortcode that received the payment
  const shortcode = String(process.env.MPESA_STK_SHORTCODE ?? '')
  const userId = await resolveUser(shortcode)

  await insertTx({
    id: randomUUID(), user_id: userId,
    mpesa_receipt: items['MpesaReceiptNumber'] as string,
    phone: normalisePhone(String(items['PhoneNumber'])),
    amount, channel: 'stk_push', type: 'in', account_ref: null,
    transaction_date: String(items['TransactionDate']),
    business_lock: businessLock, savings_growth: savingsGrowth,
    flexible_funds: flexibleFunds, allocated: 1,
  })

  console.log(`[STK] Saved — KES ${amount} for user ${userId ?? 'unmatched'}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

// ── C2B Validation ────────────────────────────────────────────────────────────
export function handleC2BValidation(req: Request, res: Response) {
  const { TransAmount, MSISDN, BillRefNumber } = req.body
  console.log(`[C2B Validation] Phone: ${MSISDN}, Amount: ${TransAmount}, Ref: ${BillRefNumber}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

// ── C2B Confirmation ──────────────────────────────────────────────────────────
export async function handleC2BConfirmation(req: Request, res: Response) {
  const { TransID, TransAmount, MSISDN, BillRefNumber, TransTime, BusinessShortCode } = req.body
  const amount = Number(TransAmount)
  const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

  // Match to user via their Till/Paybill shortcode or Pochi phone number
  const identifier = BusinessShortCode ?? normalisePhone(String(MSISDN))
  const userId = await resolveUser(identifier)

  await insertTx({
    id: randomUUID(), user_id: userId, mpesa_receipt: TransID,
    phone: normalisePhone(String(MSISDN)), amount,
    channel: BusinessShortCode ? 'paybill' : 'pochi', type: 'in',
    account_ref: BillRefNumber ?? null, transaction_date: String(TransTime),
    business_lock: businessLock, savings_growth: savingsGrowth,
    flexible_funds: flexibleFunds, allocated: 1,
  })

  console.log(`[C2B] Saved — KES ${amount} for user ${userId ?? 'unmatched'}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

export function handleTransactionResult(req: Request, res: Response) {
  console.log('[Transaction Status Result]', JSON.stringify(req.body, null, 2))
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

export function handleTransactionTimeout(req: Request, res: Response) {
  console.warn('[Transaction Status Timeout]', req.body)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}
