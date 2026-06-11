import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import type { EmailOtpType } from '@supabase/supabase-js'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

/** Resolve the real public origin behind the proxy (org subdomain, custom domain, etc.). */
function getOrigin(request: NextRequest): string {
  const fwdHost = request.headers.get('x-forwarded-host')
  const fwdProto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (fwdHost && !fwdHost.startsWith('0.0.0.0') && !fwdHost.startsWith('127.')) {
    return `${fwdProto}://${fwdHost}`
  }
  const host = request.headers.get('host') ?? ''
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.')) {
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    return `${proto}://${host}`
  }
  return process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : `https://${PLATFORM_DOMAIN}`
}

/** Normalise a destination to a safe relative path (pathname+search). */
function safeRelative(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('/')) return url
  try {
    const u = new URL(url)
    if (u.hostname === PLATFORM_DOMAIN || u.hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
      return u.pathname + u.search
    }
  } catch {
    /* not a URL */
  }
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = safeRelative(searchParams.get('next'))

  const origin = getOrigin(request)
  const errorRedirect = (reason: string) =>
    `${origin}/login?error=confirmation_failed&reason=${encodeURIComponent(reason)}`

  // The server client writes refreshed/new session cookies onto the outgoing
  // response — this is exactly what a Server Component could NOT do, which is
  // why the previous page-based callback silently dropped every session.
  const supabase = await createServerClient()

  if (code) {
    // PKCE code exchange (Google OAuth and any PKCE email link). The code
    // verifier cookie was set browser-side on this same host and is sent here.
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(errorRedirect(error.message))
  } else if (tokenHash && type) {
    // Stateless email confirmation / recovery link.
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return NextResponse.redirect(errorRedirect(error.message))
  } else {
    // No server-visible params — tokens are in the URL fragment (implicit hash
    // flow). The fragment never reaches the server, so hand off to a browser
    // page; the fragment is preserved across this redirect per RFC 7231 §7.1.2.
    return NextResponse.redirect(`${origin}/auth/confirm`)
  }

  // Pick the post-auth destination. Explicit ?next= always wins. Otherwise
  // mirror the password-login routing (actions/auth.ts): on an org subdomain
  // go to /dashboard; on the platform/apex domain (no org context) route by
  // role — platform admins to /super, everyone else to /choose-org. Sending an
  // apex login to /dashboard would break (it requires org context).
  let dest = nextParam
  if (!dest) {
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = request.headers.get('x-org-id')

    if (orgId) {
      // Org subdomain — honor a stored signup destination, else the dashboard.
      const meta = user?.user_metadata?.redirect_destination as string | undefined
      dest = safeRelative(meta) ?? '/dashboard'
    } else if (user) {
      // Platform/apex domain — route by platform role.
      const service = createServiceRoleClient()
      const { data: profile } = await service
        .from('profiles')
        .select('platform_role')
        .eq('id', user.id)
        .single()
      dest = profile?.platform_role === 'platform_admin' ? '/super' : '/choose-org'
    } else {
      dest = '/choose-org'
    }
  }

  return NextResponse.redirect(`${origin}${dest}`)
}
