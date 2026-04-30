import { NextResponse } from 'next/server'
import { getTwilioConfigStatus } from '@/lib/twilio'

// Temporary diagnostic endpoint — DELETE after confirming credentials are correct
export async function GET() {
  const status = getTwilioConfigStatus()
  return NextResponse.json(status)
}
