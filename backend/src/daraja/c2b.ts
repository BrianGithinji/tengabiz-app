import axios from 'axios'
import { darajaBase, getAccessToken } from './auth.js'

// ── Register C2B URLs with Safaricom ──────────────────────────────────────────
// Call this ONCE (or whenever your callback URL changes).
// Safaricom will POST to these URLs when a customer pays your Till/Paybill.
export async function registerC2BUrls() {
  const token = await getAccessToken()
  const base = process.env.CALLBACK_BASE_URL!

  const url = `${darajaBase()}/mpesa/c2b/v1/registerurl`
  const payload = {
    ShortCode: process.env.MPESA_SHORTCODE,
    ResponseType: 'Completed',
    ConfirmationURL: `${base}/api/payments/c2b-confirmation`,
    ValidationURL: `${base}/api/payments/c2b-validation`,
  }

  console.log('[C2B] URL:', url)
  console.log('[C2B] MPESA_ENV:', process.env.MPESA_ENV)
  console.log('[C2B] ShortCode:', process.env.MPESA_SHORTCODE)
  console.log('[C2B] Callback base:', base)
  console.log('[C2B] ConfirmationURL:', payload.ConfirmationURL)
  console.log('[C2B] ValidationURL:', payload.ValidationURL)
  console.log('[C2B] Token received:', Boolean(token))
  console.log('[C2B] Token length:', token?.length)

  try {
    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    })
    console.log('[C2B] Daraja status:', response.status)
    console.log('[C2B] Daraja response:', response.data)
    return response.data
  } catch (err: any) {
    console.error('[C2B] Daraja status:', err?.response?.status)
    console.error('[C2B] Daraja response:', err?.response?.data)
    console.error('[C2B] Daraja headers:', err?.response?.headers)
    throw err
  }
}

// ── Transaction Status Query ──────────────────────────────────────────────────
export async function queryTransactionStatus(transactionId: string) {
  const token = await getAccessToken()

  const { data } = await axios.post(
    `${darajaBase()}/mpesa/transactionstatus/v1/query`,
    {
      Initiator: process.env.MPESA_INITIATOR_NAME ?? 'testapi',
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL ?? '',
      CommandID: 'TransactionStatusQuery',
      TransactionID: transactionId,
      PartyA: process.env.MPESA_SHORTCODE,
      IdentifierType: '4', // 4 = shortcode
      ResultURL: `${process.env.CALLBACK_BASE_URL}/api/mpesa/transaction-result`,
      QueueTimeOutURL: `${process.env.CALLBACK_BASE_URL}/api/mpesa/transaction-timeout`,
      Remarks: 'TENGABIZ status check',
      Occasion: '',
    },
    { headers: { Authorization: `Bearer ${token}` } }
  )

  return data
}
