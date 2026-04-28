import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

// Twilio sends a POST with form-encoded params
// STOP means opt-out, START means opt back in
export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = new URLSearchParams(body)
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

  // Return TwiML empty response
  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
