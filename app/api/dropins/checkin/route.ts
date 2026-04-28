import { NextRequest, NextResponse } from 'next/server'
import { checkInByToken } from '@/actions/dropins'

// GET /api/dropins/checkin?token=xxx  — used when scanning a QR code URL
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const result = await checkInByToken(token)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
