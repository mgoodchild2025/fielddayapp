'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

function isSafeDestination(url: string): boolean {
  if (url.startsWith('/')) return true
  try {
    const u = new URL(url)
    return u.hostname === PLATFORM_DOMAIN || u.hostname.endsWith(`.${PLATFORM_DOMAIN}`)
  } catch {
    return false
  }
}

function readAuthRedirectCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)auth_redirect=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

function clearAuthRedirectCookie() {
  const isProduction = !window.location.hostname.includes('localhost')
  const domainAttr = isProduction ? `; domain=.${PLATFORM_DOMAIN}` : ''
  document.cookie = `auth_redirect=; Max-Age=0; path=/${domainAttr}`
}

export default function AuthCallbackClient({
  next,
  origin,
}: {
  next: string
  origin: string
}) {
  useEffect(() => {
    // Prefer the cookie set at signup time — it survives Supabase stripping
    // query params from the redirectTo URL during the implicit-flow redirect.
    const cookieRedirect = readAuthRedirectCookie()
    clearAuthRedirectCookie()

    const rawDestination = (cookieRedirect && isSafeDestination(cookieRedirect))
      ? cookieRedirect
      : isSafeDestination(next)
        ? next.startsWith('/') ? `${origin}${next}` : next
        : `${origin}/my-events`

    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    const errorDestination = `${origin}/login?error=confirmation_failed`

    if (!accessToken || !refreshToken) {
      window.location.replace(errorDestination)
      return
    }

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        window.location.replace(error ? errorDestination : rawDestination)
      })
  }, [next, origin])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', fontSize: '15px' }}>Confirming your email…</p>
    </div>
  )
}
