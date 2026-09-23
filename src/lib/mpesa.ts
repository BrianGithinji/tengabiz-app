const BASE = import.meta.env.VITE_API_URL ?? ''

function getToken() {
  return localStorage.getItem('tengabiz_token')
}

async function post<T>(path: string, body?: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

async function get<T>(path: string, auth = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`
  const res = await fetch(`${BASE}${path}`, { headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string
  userId: string
  businessName: string
  ownerName: string
}

export interface User {
  id: string
  email: string
  business_name: string
  owner_name: string
  phone: string | null
  location: string | null
  created_at: string
}

export interface Channel {
  id: string
  user_id: string
  type: 'till' | 'paybill' | 'pochi'
  identifier: string
  label: string | null
  active: boolean
  created_at: string
}

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
  user_id: string
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

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (body: {
    email: string; password: string; businessName: string
    ownerName: string; phone?: string; location?: string
  }) => post<AuthResponse>('/api/auth/register', body),

  login: (email: string, password: string) =>
    post<AuthResponse>('/api/auth/login', { email, password }),

  me: () => get<User>('/api/auth/me', true),
}

// ── Channels ──────────────────────────────────────────────────────────────────

export const channels = {
  list: () => get<Channel[]>('/api/channels', true),

  add: (body: { type: 'till' | 'paybill' | 'pochi'; identifier: string; label?: string }) =>
    post<Channel>('/api/channels', body, true),

  remove: (id: string) => del<{ success: boolean }>(`/api/channels/${id}`),
}

// ── M-PESA ────────────────────────────────────────────────────────────────────

export const mpesa = {
  stkPush: (body: StkPushRequest) =>
    post<StkPushResponse>('/api/mpesa/stk-push', body, true),

  stkQuery: (checkoutRequestId: string) =>
    post<StkQueryResponse>('/api/mpesa/stk-query', { checkoutRequestId }, true),

  getTransactions: () => get<Transaction[]>('/api/mpesa/transactions', true),

  getSummary: () => get<Summary>('/api/mpesa/summary', true),
}
