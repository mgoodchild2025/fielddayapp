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

export async function sendSms(to: string, body: string) {
  const tw = getTwilioClient()
  if (!tw || !TWILIO_FROM) return { error: 'SMS not configured' }
  try {
    await tw.messages.create({ from: TWILIO_FROM, to, body })
    return { error: null }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
