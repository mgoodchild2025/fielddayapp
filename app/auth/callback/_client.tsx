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

export default function AuthCallbackClient({
  next,
  origin,
}: {
  next: string
  origin: string
}) {
  useEffect(() => {
    // Parse the URL hash fragment manually — the Supabase client's automatic
    // hash detection is async and may not complete before getSession() is called.
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    const destination = isSafeDestination(next)
      ? next.startsWith('/') ? `${origin}${next}` : next
      : `${origin}/my-events`
    const errorDestination = `${origin}/login?error=confirmation_failed`

    if (!accessToken || !refreshToken) {
      window.location.replace(errorDestination)
      return
    }

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        window.location.replace(error ? errorDestination : destination)
      })
  }, [next, origin])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', fontSize: '15px' }}>Confirming your email…</p>
    </div>
  )
}
