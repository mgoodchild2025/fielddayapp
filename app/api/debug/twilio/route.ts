import { NextResponse } from 'next/server'
import { getTwilioConfigStatus, getTwilioClient } from '@/lib/twilio'

// Temporary diagnostic endpoint — DELETE after confirming credentials are correct
export async function GET() {
  const status = getTwilioConfigStatus()

  const client = getTwilioClient()
  if (!client) {
    return NextResponse.json({ ...status, credentialsValid: false, error: 'Client not initialised — check env vars' })
  }

  try {
    const account = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID!.trim()).fetch()
    return NextResponse.json({
      ...status,
      credentialsValid: true,
      accountStatus: account.status,
      accountFriendlyName: account.friendlyName,
      accountType: account.type,
    })
  } catch (err: unknown) {
    const e = err as { code?: number; status?: number; message?: string; moreInfo?: string }
    return NextResponse.json({
      ...status,
      credentialsValid: false,
      twilioError: {
        message: e.message,
        code: e.code,
        status: e.status,
        moreInfo: e.moreInfo,
      },
    })
  }
}
