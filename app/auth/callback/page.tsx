import { headers } from 'next/headers'
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

  // `next` is a safe relative/absolute path to redirect to after auth
  const next = params.next && isSafeDestination(params.next) ? params.next : undefined

  // All three auth flows are handled browser-side in the client component so
  // that the Supabase browser client can write session cookies. Server
  // components cannot write cookies, which would silently drop the session.
  return (
    <AuthCallbackClient
      origin={origin}
      code={params.code}
      tokenHash={params.token_hash}
      type={params.type}
      next={next}
    />
  )
}
