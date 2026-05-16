import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import AuthCallbackClient from './_client'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

function getOriginFromHeaders(headersList: Awaited<ReturnType<typeof headers>>): string {
  const fwdHost = headersList.get('x-forwarded-host')
  const fwdProto = headersList.get('x-forwarded-proto') ?? 'https'
  if (fwdHost && !fwdHost.startsWith('0.0.0.0') && !fwdHost.startsWith('127.')) {
    return `${fwdProto}://${fwdHost}`
  }
  const host = headersList.get('host') ?? ''
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.')) {
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    return `${proto}://${host}`
  }
  const isDev = process.env.NODE_ENV === 'development'
  return isDev ? 'http://localhost:3000' : `https://${PLATFORM_DOMAIN}`
}

function buildRedirectTo(next: string, origin: string): string {
  if (next.startsWith('/')) return `${origin}${next}`
  try {
    const u = new URL(next)
    const allowed = u.hostname === PLATFORM_DOMAIN || u.hostname.endsWith(`.${PLATFORM_DOMAIN}`)
    return allowed ? next : `${origin}/my-events`
  } catch {
    return `${origin}/my-events`
  }
}

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }>
}) {
  const params = await searchParams
  const headersList = await headers()
  const origin = getOriginFromHeaders(headersList)
  const next = params.next ?? '/my-events'
  const redirectTo = buildRedirectTo(next, origin)
  const errorRedirect = `${origin}/login?error=confirmation_failed`

  // ── token_hash flow (stateless — sent as query param) ────────────────────
  if (params.token_hash && params.type) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: params.type as EmailOtpType,
    })
    if (!error) redirect(redirectTo)
    redirect(errorRedirect)
  }

  // ── PKCE code flow ───────────────────────────────────────────────────────
  if (params.code) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(params.code)
    if (!error) redirect(redirectTo)
    redirect(errorRedirect)
  }

  // ── Implicit / hash flow ─────────────────────────────────────────────────
  // Supabase returned tokens in the URL fragment (#access_token=...).
  // The fragment never reaches the server, so we render a client component
  // that reads it and establishes the session via the browser Supabase client.
  return <AuthCallbackClient next={next} origin={origin} />
}
