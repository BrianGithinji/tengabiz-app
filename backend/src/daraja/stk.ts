import axios from 'axios'
import { darajaBase, getAccessToken } from './auth.js'

export interface StkPushParams {
  phone: string       // format: 2547XXXXXXXX
  amount: number      // KES, whole number
  accountRef: string  // e.g. business name or order ID
  description: string // shown on customer's phone
}

export interface StkPushResult {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14)
}

function password(ts: string): string {
  const shortcode = process.env.MPESA_STK_SHORTCODE!
  const passkey = process.env.MPESA_PASSKEY!
  return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64')
}

export async function stkPush(params: StkPushParams): Promise<StkPushResult> {
  const token = await getAccessToken()
  const ts = timestamp()
  const callbackUrl = `${process.env.CALLBACK_BASE_URL}/api/payments/stk-callback`

  const payload = {
    BusinessShortCode: process.env.MPESA_STK_SHORTCODE,
    Password: password(ts),
    Timestamp: ts,
    TransactionType: process.env.MPESA_C2B_TYPE ?? 'CustomerBuyGoodsOnline',
    Amount: Math.round(params.amount),
    PartyA: params.phone,
    PartyB: process.env.MPESA_STK_SHORTCODE,
    PhoneNumber: params.phone,
    CallBackURL: callbackUrl,
    AccountReference: params.accountRef.slice(0, 12),
    TransactionDesc: params.description.slice(0, 13),
  }

  const { data } = await axios.post<StkPushResult>(
    `${darajaBase()}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  return data
}

// ── STK Query — check if a push was completed ─────────────────────────────────
export async function stkQuery(checkoutRequestId: string) {
  const token = await getAccessToken()
  const ts = timestamp()

  const { data } = await axios.post(
    `${darajaBase()}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: process.env.MPESA_STK_SHORTCODE,
      Password: password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  )

  return data
}
