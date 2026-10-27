import { readJsonResponse } from './response'

const BASE = import.meta.env.VITE_API_URL ?? ''

function getToken() {
  return localStorage.getItem('tengabiz_token')
}

async function post<T>(path: string, body?: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.')
  }
  const data = await readJsonResponse<T & { error?: string }>(res)
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

async function get<T>(path: string, auth = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { headers })
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.')
  }
  const data = await readJsonResponse<T & { error?: string }>(res)
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

async function del<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.')
  }
  const data = await readJsonResponse<T & { error?: string }>(res)
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

export interface Product {
  id: string
  user_id: string
  name: string
  description: string | null
  sku: string | null
  barcode: string | null
  category: string | null
  unit: string
  cost_price: number
  selling_price: number
  wholesale_price: number | null
  current_stock: number
  reorder_threshold: number
  supplier_name: string | null
  expiry_date: string | null
  active: boolean
  created_at: string
  updated_at: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (body: {
    firstName: string; lastName: string; phone: string; email?: string; pin: string
    businessName: string; ownerName: string
    businessType?: string; location?: string; description?: string; lat?: number; lng?: number
  }) => post<AuthResponse>('/api/auth/register', body),

  login: (phone: string, pin: string) =>
    post<AuthResponse>('/api/auth/login', { phone, pin }),

  requestPinReset: (phone: string) =>
    post<{ message: string }>('/api/auth/forgot-pin', { phone }),

  resetPin: (phone: string, code: string, pin: string) =>
    post<{ message: string }>('/api/auth/reset-pin', { phone, code, pin }),

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

export const pos = {
  listProducts: () => get<Product[]>('/api/pos/products', true),

  createProduct: (body: Record<string, unknown>) =>
    post<Product>('/api/pos/products', body, true),

  receiveStock: (productId: string, body: Record<string, unknown>) =>
    post<{ product: Product; movement: { previous: number; next: number; quantity: number } }>(`/api/pos/products/${productId}/receive-stock`, body, true),

  createSale: (body: Record<string, unknown>) =>
    post<{ sale: Record<string, unknown>; receiptNumber: string; duplicate: boolean }>(`/api/pos/sales`, body, true),
}
