import axios from 'axios'

const BASE_URL = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
}

export function darajaBase(): string {
  const env = process.env.MPESA_ENV ?? 'sandbox'
  return BASE_URL[env as keyof typeof BASE_URL] ?? BASE_URL.sandbox
}

// ── Token cache ───────────────────────────────────────────────────────────────
let cachedToken: string | null = null
let tokenExpiresAt = 0

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const key = process.env.MPESA_CONSUMER_KEY!
  const secret = process.env.MPESA_CONSUMER_SECRET!
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64')

  const { data } = await axios.get(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  })

  cachedToken = data.access_token as string
  // Safaricom tokens last 3600s — refresh 60s early
  tokenExpiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000

  return cachedToken
}
