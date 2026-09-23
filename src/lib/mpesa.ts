const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StkPushRequest {
  phone: string
  amount: number
  accountRef: string
  description: string
}

export interface StkPushResponse {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

export interface StkQueryResponse {
  ResponseCode: string
  ResponseDescription: string
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: string
  ResultDesc: string
}

export interface Transaction {
  id: string
  mpesa_receipt: string
  phone: string
  amount: number
  channel: string
  type: 'in' | 'out'
  account_ref: string | null
  transaction_date: string
  business_lock: number
  savings_growth: number
  flexible_funds: number
  allocated: number
  created_at: string
}

export interface Summary {
  total_in: number
  total_business_lock: number
  total_savings: number
  total_flexible: number
  tx_count: number
}

// ── API ───────────────────────────────────────────────────────────────────────

export const mpesa = {
  stkPush: (body: StkPushRequest) =>
    post<StkPushResponse>('/api/mpesa/stk-push', body),

  stkQuery: (checkoutRequestId: string) =>
    post<StkQueryResponse>('/api/mpesa/stk-query', { checkoutRequestId }),

  registerC2B: () =>
    post('/api/mpesa/register-c2b'),

  transactionStatus: (transactionId: string) =>
    post('/api/mpesa/transaction-status', { transactionId }),

  getTransactions: () =>
    get<Transaction[]>('/api/mpesa/transactions'),

  getSummary: () =>
    get<Summary>('/api/mpesa/summary'),
}
