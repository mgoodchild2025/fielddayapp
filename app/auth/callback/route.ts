import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// Handles the redirect after a user clicks a Supabase email link
// (email confirmation, password reset, magic link, etc.)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Support absolute URLs for cross-subdomain post-verification redirects
      const redirectTo =
        next.startsWith('https://') || next.startsWith('http://')
          ? next
          : `${origin}${next}`
      return NextResponse.redirect(redirectTo)
    }
  }

  // Something went wrong — send to login with a hint
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
}
