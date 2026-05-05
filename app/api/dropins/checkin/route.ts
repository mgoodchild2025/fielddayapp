import { NextRequest, NextResponse } from 'next/server'
import { checkInByToken } from '@/actions/dropins'
import { createRateLimiter, getClientIp } from '@/lib/rate-limit'

// 20 check-in scans per minute per IP — generous for legitimate QR scanning,
// tight enough to prevent token enumeration.
const limiter = createRateLimiter({ windowMs: 60_000, max: 20 })

// GET /api/dropins/checkin?token=xxx  — used when scanning a QR code URL
export async function GET(request: NextRequest) {
  const { limited, remaining, resetAt } = limiter.check(getClientIp(request))
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      },
    )
  }

  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const result = await checkInByToken(token)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(
    { ok: true },
    { headers: { 'X-RateLimit-Remaining': String(remaining) } },
  )
}
