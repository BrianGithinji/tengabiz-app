const API_URLS = {
  sandbox: 'https://api.sandbox.africastalking.com/version1/messaging',
  production: 'https://api.africastalking.com/version1/messaging',
} as const

export function isRecoverySmsConfigured(): boolean {
  const environment = process.env.AFRICASTALKING_ENV ?? 'sandbox'
  return Boolean(
    process.env.AFRICASTALKING_USERNAME
      && process.env.AFRICASTALKING_API_KEY
      && (environment === 'sandbox' || environment === 'production'),
  )
}

export async function sendRecoveryCode(phone: string, code: string): Promise<void> {
  const username = process.env.AFRICASTALKING_USERNAME
  const apiKey = process.env.AFRICASTALKING_API_KEY
  const environment = process.env.AFRICASTALKING_ENV ?? 'sandbox'

  if (!username || !apiKey) {
    throw new Error('Africa’s Talking SMS credentials are not configured.')
  }
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('AFRICASTALKING_ENV must be sandbox or production.')
  }

  const body = new URLSearchParams({
    username,
    to: phone,
    message: `Your TENGABIZ PIN reset code is ${code}. It expires in 10 minutes. Do not share this code.`,
  })
  const senderId = process.env.AFRICASTALKING_SENDER_ID
  if (senderId) body.set('from', senderId)

  const response = await fetch(API_URLS[environment], {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })

  const result = await response.json() as {
    SMSMessageData?: {
      Recipients?: Array<{ statusCode?: number; status?: string }>
    }
  }
  const recipient = result.SMSMessageData?.Recipients?.[0]
  if (!response.ok || recipient?.statusCode !== 101) {
    throw new Error(`Africa’s Talking SMS request failed with HTTP ${response.status}.`)
  }
}
