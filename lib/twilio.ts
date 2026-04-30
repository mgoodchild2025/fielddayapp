import twilio from 'twilio'

// Trim all values — copy-paste into Railway/Vercel can silently add whitespace
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim() ?? ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim() ?? ''
export const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER?.trim() ?? ''

let client: twilio.Twilio | null = null

export function getTwilioClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) return null
  if (!client) {
    client = twilio(ACCOUNT_SID, AUTH_TOKEN)
  }
  return client
}

export function getTwilioConfigStatus() {
  return {
    accountSidSet: !!ACCOUNT_SID,
    accountSidPrefix: ACCOUNT_SID ? ACCOUNT_SID.slice(0, 4) : '(not set)',
    authTokenSet: !!AUTH_TOKEN,
    authTokenLength: AUTH_TOKEN.length,
    fromNumberSet: !!TWILIO_FROM,
    fromNumber: TWILIO_FROM || '(not set)',
  }
}

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
    // RestException has code + status; include them to help diagnose credential issues
    const e = err as { message?: string; code?: number; status?: number }
    const detail = [e.message, e.code && `code ${e.code}`, e.status && `HTTP ${e.status}`]
      .filter(Boolean).join(' · ')
    return { error: detail || String(err) }
  }
}
