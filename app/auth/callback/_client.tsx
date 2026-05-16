'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

function isSafeDestination(url: string, origin: string): boolean {
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
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // The Supabase browser client automatically reads the URL hash fragment
    // and exchanges the implicit-flow tokens into a session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const destination = isSafeDestination(next, origin)
          ? next.startsWith('/') ? `${origin}${next}` : next
          : `${origin}/my-events`
        // Use replace so the callback URL doesn't remain in history
        window.location.replace(destination)
      } else {
        window.location.replace(`${origin}/login?error=confirmation_failed`)
      }
    })
  }, [next, origin])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', fontSize: '15px' }}>Confirming your email…</p>
    </div>
  )
}
