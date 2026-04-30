import twilio from 'twilio'

let client: twilio.Twilio | null = null

export function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return null
  }
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  }
  return client
}

export const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER ?? ''

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`      // North American 10-digit
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (phone.startsWith('+')) return phone              // already E.164
  return `+${digits}`
}

export async function sendSms(to: string, body: string) {
  const tw = getTwilioClient()
  if (!tw || !TWILIO_FROM) return { error: 'SMS not configured — check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER env vars' }
  try {
    await tw.messages.create({ from: TWILIO_FROM, to: toE164(to), body })
    return { error: null }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
