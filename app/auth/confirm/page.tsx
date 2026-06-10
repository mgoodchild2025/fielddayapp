'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

function isSafe(url: string): boolean {
  if (!url) return false
  if (url.startsWith('/')) return true
  try {
    const u = new URL(url)
    return u.hostname === PLATFORM_DOMAIN || u.hostname.endsWith(`.${PLATFORM_DOMAIN}`)
  } catch {
    return false
  }
}

/**
 * Handles the implicit (hash) auth flow where Supabase returns tokens in the
 * URL fragment (#access_token=…&refresh_token=…). The fragment is only visible
 * to the browser, so this must run client-side. The route handler at
 * /auth/callback redirects here when no server-visible params are present.
 */
export default function AuthConfirmPage() {
  useEffect(() => {
    const supabase = createClient()
    const errorDest = '/login?error=confirmation_failed'

    const params = new URLSearchParams(window.location.hash.substring(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (!access_token || !refresh_token) {
      window.location.replace(errorDest)
      return
    }

    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ data: { session }, error }) => {
        if (error || !session) {
          window.location.replace(errorDest)
          return
        }
        const meta = session.user?.user_metadata?.redirect_destination as string | undefined
        window.location.replace(meta && isSafe(meta) ? meta : '/dashboard')
      })
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', fontSize: '15px' }}>Signing you in…</p>
    </div>
  )
}
