'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EmailOtpType } from '@supabase/supabase-js'

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

interface Props {
  origin: string
  code?: string
  tokenHash?: string
  type?: string
  next?: string
}

export default function AuthCallbackClient({ origin, code, tokenHash, type, next }: Props) {
  useEffect(() => {
    const supabase = createClient()
    const errorDestination = `${origin}/login?error=confirmation_failed`
    const defaultDestination = `${origin}/dashboard`

    async function handle() {
      // ── PKCE OAuth code exchange (Google, GitHub, etc.) ──────────────────
      // Must happen browser-side so the browser Supabase client can write the
      // session cookies — server components cannot write cookies.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          window.location.replace(errorDestination)
          return
        }
        const dest = next && isSafeDestination(next) ? next : defaultDestination
        window.location.replace(dest)
        return
      }

      // ── Email OTP / magic link (token_hash) ──────────────────────────────
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        })
        if (error) {
          window.location.replace(errorDestination)
          return
        }
        const { data: { user } } = await supabase.auth.getUser()
        const meta = user?.user_metadata?.redirect_destination as string | undefined
        const dest = (next && isSafeDestination(next))
          ? next
          : (meta && isSafeDestination(meta) ? meta : defaultDestination)
        window.location.replace(dest)
        return
      }

      // ── Implicit / hash flow — tokens are in the URL fragment ─────────────
      // The fragment never reaches the server so this always runs client-side.
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        window.location.replace(errorDestination)
        return
      }

      const { data: { session }, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error || !session) {
        window.location.replace(errorDestination)
        return
      }
      const meta = session.user?.user_metadata?.redirect_destination as string | undefined
      const dest = (next && isSafeDestination(next))
        ? next
        : (meta && isSafeDestination(meta) ? meta! : defaultDestination)
      window.location.replace(dest)
    }

    handle()
  }, [origin, code, tokenHash, type, next])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', fontSize: '15px' }}>Signing you in…</p>
    </div>
  )
}
