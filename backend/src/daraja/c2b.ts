import axios from 'axios'
import { darajaBase, getAccessToken } from './auth.js'

// ── Register C2B URLs with Safaricom ──────────────────────────────────────────
// Call this ONCE (or whenever your callback URL changes).
// Safaricom will POST to these URLs when a customer pays your Till/Paybill.
export async function registerC2BUrls() {
  const token = await getAccessToken()
  const base = process.env.CALLBACK_BASE_URL!

  const { data } = await axios.post(
    `${darajaBase()}/mpesa/c2b/v1/registerurl`,
    {
      ShortCode: process.env.MPESA_SHORTCODE,
      ResponseType: 'Completed', // "Completed" | "Cancelled"
      ConfirmationURL: `${base}/api/payments/c2b-confirmation`,
      ValidationURL: `${base}/api/payments/c2b-validation`,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  )

  return data
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
