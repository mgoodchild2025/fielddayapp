import { NextRequest, NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

// Handles the redirect after a user clicks a Supabase email link
// (email confirmation, password reset, magic link, etc.)
//
// Supabase sends either:
//   ?code=...              — PKCE flow (requires code_verifier cookie from same browser)
//   ?token_hash=...&type=  — token-hash flow (stateless, works across browsers/devices)
//
// We handle both so that email confirmation works even when the user opens the
// link on a different device or browser than where they signed up.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/my-events'

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
    return NextResponse.redirect(errorRedirect)
  }

  // ── PKCE flow (requires code_verifier cookie from signup browser) ─────────
  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(redirectTo)
    return NextResponse.redirect(errorRedirect)
  }

  // No recognised parameters
  return NextResponse.redirect(errorRedirect)
}
