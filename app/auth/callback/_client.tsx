'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

function isSafeDestination(url: string): boolean {
  if (!url) return false
  if (url.startsWith('/')) return true
  try {
    const u = new URL(url)
    return u.hostname === PLATFORM_DOMAIN || u.hostname.endsWith(`.${PLATFORM_DOMAIN}`)
  } catch {
    return false
  }
}

export default function AuthCallbackClient({ origin }: { origin: string }) {
  useEffect(() => {
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
      .then(({ data: { session }, error }) => {
        if (error || !session) {
          window.location.replace(errorDestination)
          return
        }
        // redirect_destination is stored in user_metadata at signup time —
        // it travels inside the JWT so no cookies or query params are needed.
        const meta = session.user?.user_metadata?.redirect_destination as string | undefined
        const destination = isSafeDestination(meta ?? '')
          ? meta!
          : `${origin}/dashboard`
        window.location.replace(destination)
      })
  }, [origin])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', fontSize: '15px' }}>Confirming your email…</p>
    </div>
  )
}
