'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  redirectTo?: string
  label?: string
}

export function GoogleAuthButton({ redirectTo, label = 'Continue with Google' }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const supabase = createClient()
    // Only carry a destination when there's an explicit redirect target. Otherwise
    // let the callback compute the right destination by org context + role
    // (org → /dashboard, platform admin → /super, org-less → /choose-org).
    // Hardcoding /dashboard here breaks apex/platform logins.
    const next = redirectTo && redirectTo.startsWith('/') ? redirectTo : null
    // Carry the post-login destination in a short-lived cookie rather than as a
    // query string on the OAuth redirectTo. A query on redirectTo can fail
    // Supabase's redirect-allowlist match, which bounces the callback to the
    // project Site URL (a different host) where the PKCE code-verifier cookie
    // doesn't exist — so the code exchange fails and the user loops back to
    // /login. Keeping the callback URL constant matches the allowlist; the
    // callback reads this cookie for `next`.
    if (next) {
      document.cookie = `fd_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; SameSite=Lax`
    }
    const callbackUrl = `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })
    // signInWithOAuth redirects the page — if we get here something failed
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
    >
      {/* Google 'G' logo SVG */}
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
      </svg>
      {loading ? 'Redirecting…' : label}
    </button>
  )
}
