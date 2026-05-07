import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServiceRoleClient } from '@/lib/supabase/service'

const TWIML_EMPTY = '<Response></Response>'
const TWIML_HEADERS = { 'Content-Type': 'text/xml' }

function twiml() {
  return new NextResponse(TWIML_EMPTY, { headers: TWIML_HEADERS })
}

// Twilio sends a POST with form-encoded params.
// STOP / UNSUBSCRIBE → opt out; START / SUBSCRIBE → opt back in.
export async function POST(req: NextRequest) {
  const body = await req.text()

  // ── Validate Twilio signature ────────────────────────────────────────────
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? ''
  if (!authToken) {
    console.error('[sms/inbound] TWILIO_AUTH_TOKEN not set — rejecting request')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const signature = req.headers.get('x-twilio-signature') ?? ''
  // Reconstruct the full URL that Twilio signed (must match the webhook URL
  // configured in the Twilio console exactly, including scheme and host).
  const url = req.url

  // Build the params object Twilio used for the HMAC (all POST body params)
  const params = new URLSearchParams(body)
  const paramObj: Record<string, string> = {}
  params.forEach((value, key) => { paramObj[key] = value })

  const isValid = twilio.validateRequest(authToken, signature, url, paramObj)
  if (!isValid) {
    // Twilio always signs its requests — an invalid signature means this is not
    // from Twilio. Return 200 + empty TwiML to avoid Twilio error alerts, but
    // do not process the payload.
    console.warn('[sms/inbound] Invalid Twilio signature — ignoring request')
    return twiml()
  }

  // ── Process opt-in / opt-out ─────────────────────────────────────────────
  const from = params.get('From') ?? ''
  const messageBody = (params.get('Body') ?? '').trim().toUpperCase()

  const supabase = createServiceRoleClient()

  if (messageBody === 'STOP' || messageBody === 'UNSUBSCRIBE') {
    await supabase
      .from('profiles')
      .update({ sms_opted_in: false })
      .eq('phone', from)
  } else if (messageBody === 'START' || messageBody === 'SUBSCRIBE') {
    await supabase
      .from('profiles')
      .update({ sms_opted_in: true })
      .eq('phone', from)
  }

  return twiml()
}
