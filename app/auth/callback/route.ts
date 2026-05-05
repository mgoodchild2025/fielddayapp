import { NextRequest, NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

/**
 * Derive the real public-facing origin from request headers.
 * `request.url` on Vercel / containerised hosts resolves to an internal address
 * like http://0.0.0.0:8080, so we must NOT use it for redirect targets.
 */
function getOriginFromRequest(request: NextRequest): string {
  const fwdHost = request.headers.get('x-forwarded-host')
  const fwdProto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (fwdHost && !fwdHost.startsWith('0.0.0.0') && !fwdHost.startsWith('127.')) {
    return `${fwdProto}://${fwdHost}`
  }

  const host = request.headers.get('host') ?? ''
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.')) {
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    return `${proto}://${host}`
  }

  // Hard fallback — always better than an internal address in an email link
  const isDev = process.env.NODE_ENV === 'development'
  return isDev ? 'http://localhost:3000' : `https://${PLATFORM_DOMAIN}`
}

// Handles the redirect after a user clicks a Supabase email link
// (email confirmation, password reset, magic link, etc.)
//
// Supabase sends either:
//   ?code=...              — PKCE flow (requires code_verifier cookie from same browser)
//   ?token_hash=...&type=  — token-hash flow (stateless, works across browsers/devices)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const next = searchParams.get('next') ?? '/my-events'

  // Use headers — NOT new URL(request.url) — to get the real public origin
  const origin = getOriginFromRequest(request)

  const redirectTo =
    next.startsWith('https://') || next.startsWith('http://')
      ? next
      : `${origin}${next}`

  const errorRedirect = `${origin}/login?error=confirmation_failed`

  const supabase = await createServerClient()

  // ── Token-hash flow (stateless — works on any device/browser) ────────────
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) return NextResponse.redirect(redirectTo)
    console.error('[auth/callback] verifyOtp error:', error.message)
    return NextResponse.redirect(errorRedirect)
  }

  // ── PKCE flow (requires code_verifier cookie from signup browser) ─────────
  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(redirectTo)
    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
    return NextResponse.redirect(errorRedirect)
  }

  // No recognised parameters
  return NextResponse.redirect(errorRedirect)
}
