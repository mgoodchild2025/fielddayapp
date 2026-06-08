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

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }>
}) {
  const params = await searchParams
  const headersList = await headers()
  const origin = getOriginFromHeaders(headersList)
  const errorRedirect = `${origin}/login?error=confirmation_failed`

  // `next` is a safe relative path to redirect to after auth
  const next = params.next && isSafeDestination(params.next) ? params.next : null

  // ── token_hash flow ──────────────────────────────────────────────────────
  if (params.token_hash && params.type) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: params.type as EmailOtpType,
    })
    if (error) redirect(errorRedirect)
    const { data: { user } } = await supabase.auth.getUser()
    const meta = user?.user_metadata?.redirect_destination as string | undefined
    redirect(next ?? (isSafeDestination(meta ?? '') ? meta! : `${origin}/dashboard`))
  }

  // ── PKCE code flow ───────────────────────────────────────────────────────
  if (params.code) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(params.code)
    if (error) redirect(errorRedirect)
    const { data: { user } } = await supabase.auth.getUser()
    const meta = user?.user_metadata?.redirect_destination as string | undefined
    redirect(next ?? (isSafeDestination(meta ?? '') ? meta! : `${origin}/dashboard`))
  }

  // ── Implicit / hash flow — tokens are in the URL fragment ────────────────
  // The fragment never reaches the server; the client component reads it and
  // calls setSession(), then uses redirect_destination from user_metadata.
  return <AuthCallbackClient origin={origin} />
}
