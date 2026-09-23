import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

// ── 60/20/20 TENGA allocation ─────────────────────────────────────────────────
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

const insertTx = db.prepare(`
  INSERT OR IGNORE INTO transactions
    (id, mpesa_receipt, phone, amount, channel, type, account_ref,
     transaction_date, business_lock, savings_growth, flexible_funds, allocated)
  VALUES
    (@id, @mpesa_receipt, @phone, @amount, @channel, @type, @account_ref,
     @transaction_date, @business_lock, @savings_growth, @flexible_funds, @allocated)
`)

// ── STK Push callback ─────────────────────────────────────────────────────────
export function handleStkCallback(req: Request, res: Response) {
  const body = req.body?.Body?.stkCallback

  if (!body) {
    res.status(400).json({ error: 'Invalid STK callback payload' })
    return
  }

  const { ResultCode, ResultDesc, MerchantRequestID, CallbackMetadata } = body

  if (ResultCode !== 0) {
    console.warn(`[STK] Failed — ${ResultDesc} (MerchantRequestID: ${MerchantRequestID})`)
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    return
  }

  const items: Record<string, string | number> = {}
  for (const item of CallbackMetadata?.Item ?? []) {
    items[item.Name] = item.Value
  }

  const amount = Number(items['Amount'])
  const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

  insertTx.run({
    id: randomUUID(),
    mpesa_receipt: items['MpesaReceiptNumber'] as string,
    phone: normalisePhone(String(items['PhoneNumber'])),
    amount,
    channel: 'stk_push',
    type: 'in',
    account_ref: null,
    transaction_date: String(items['TransactionDate']),
    business_lock: businessLock,
    savings_growth: savingsGrowth,
    flexible_funds: flexibleFunds,
    allocated: 1,
  })

  console.log(`[STK] Saved — KES ${amount} from ${items['PhoneNumber']} (${items['MpesaReceiptNumber']})`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

// ── C2B Validation ────────────────────────────────────────────────────────────
export function handleC2BValidation(req: Request, res: Response) {
  const { TransAmount, MSISDN, BillRefNumber } = req.body
  console.log(`[C2B Validation] Phone: ${MSISDN}, Amount: ${TransAmount}, Ref: ${BillRefNumber}`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

// ── C2B Confirmation ──────────────────────────────────────────────────────────
export function handleC2BConfirmation(req: Request, res: Response) {
  const { TransID, TransAmount, MSISDN, BillRefNumber, TransTime, BusinessShortCode } = req.body

  const amount = Number(TransAmount)
  const { businessLock, savingsGrowth, flexibleFunds } = allocate(amount)

  insertTx.run({
    id: randomUUID(),
    mpesa_receipt: TransID,
    phone: normalisePhone(String(MSISDN)),
    amount,
    channel: BusinessShortCode ? 'paybill' : 'c2b',
    type: 'in',
    account_ref: BillRefNumber ?? null,
    transaction_date: String(TransTime),
    business_lock: businessLock,
    savings_growth: savingsGrowth,
    flexible_funds: flexibleFunds,
    allocated: 1,
  })

  console.log(`[C2B] Saved — KES ${amount} from ${MSISDN} (${TransID})`)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

// ── Transaction Status result ─────────────────────────────────────────────────
export function handleTransactionResult(req: Request, res: Response) {
  console.log('[Transaction Status Result]', JSON.stringify(req.body, null, 2))
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

export function handleTransactionTimeout(req: Request, res: Response) {
  console.warn('[Transaction Status Timeout]', req.body)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}
