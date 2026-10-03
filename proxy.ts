import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const REST_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

// host → orgId, cached in memory (the app runs as one long-lived process). The
// proxy runs on every request — including RSC prefetches — so an uncached
// lookup was 1–2 Supabase round trips before any page could start. Found orgs
// are cached 60s (a suspension takes effect within a minute); unknown hosts
// only 10s, so a brand-new org's subdomain works almost immediately.
const ORG_TTL_MS = 60_000
const MISS_TTL_MS = 10_000
const orgCache = new Map<string, { orgId: string | null; expires: number }>()

async function resolveOrgIdCached(baseHost: string): Promise<string | null> {
  const now = Date.now()
  const hit = orgCache.get(baseHost)
  if (hit && hit.expires > now) return hit.orgId
  const orgId = await resolveOrgId(baseHost)
  if (orgCache.size > 5_000) orgCache.clear() // bots probing random hosts
  orgCache.set(baseHost, { orgId, expires: now + (orgId ? ORG_TTL_MS : MISS_TTL_MS) })
  return orgId
}

/** Resolve the org UUID for a given hostname. Returns null if not found. */
async function resolveOrgId(baseHost: string): Promise<string | null> {
  // Subdomain: e.g. "acme.fielddayapp.ca" or "acme.localhost"
  const subdomainMatch =
    baseHost.match(new RegExp(`^([^.]+)\\.${PLATFORM_DOMAIN.replace('.', '\\.')}$`)) ??
    baseHost.match(/^([^.]+)\.localhost$/)

  if (subdomainMatch) {
    const slug = subdomainMatch[1]
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/organizations?slug=eq.${slug}&status=neq.suspended&select=id&limit=1`,
        { headers: REST_HEADERS }
      )
      const [org] = await res.json()
      return org?.id ?? null
    } catch (err) {
      console.error('[proxy] subdomain org lookup error:', err)
      return null
    }
  }

  // Custom domain — try the exact host, then www-stripped / www-prefixed variant
  // so that entering "kaboomsportsgroup.com" in the form works for both
  // "kaboomsportsgroup.com" and "www.kaboomsportsgroup.com" visitors.
  try {
    const wwwVariant = baseHost.startsWith('www.')
      ? baseHost.slice(4)           // www.foo.com → foo.com
      : `www.${baseHost}`           // foo.com → www.foo.com
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/org_branding?custom_domain=in.(${baseHost},${wwwVariant})&select=organization_id&limit=1`,
      { headers: REST_HEADERS }
    )
    const [branding] = await res.json()
    if (!branding?.organization_id) return null

    const res2 = await fetch(
      `${SUPABASE_URL}/rest/v1/organizations?id=eq.${branding.organization_id}&status=neq.suspended&select=id&limit=1`,
      { headers: REST_HEADERS }
    )
    const [org] = await res2.json()
    return org?.id ?? null
  } catch (err) {
    console.error('[proxy] custom domain org lookup error:', err)
    return null
  }
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const baseHost = hostname.split(':')[0] // strip port for local dev

  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth/')
  const isAppDomain = baseHost === `app.${PLATFORM_DOMAIN}` || baseHost === 'app.localhost'

  // ── Step 1: ONE getUser() per request ─────────────────────────────────────
  // It refreshes the session if needed (refreshed tokens are written to the
  // request so server components see them, and collected for the response)
  // and gives us the user for the impersonation check. This used to be two
  // separate clients, each making its own round trip to Supabase Auth.
  // Auth routes (/auth/*) skip it — the OAuth callback writes the session
  // itself and a refresh mid-exchange can drop the PKCE verifier cookie —
  // except on the app. domain, which needs the user to vet impersonation.
  const refreshedCookies: { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }[] = []
  let currentUser: { app_metadata?: Record<string, unknown> } | null = null
  if (!isAuthRoute || isAppDomain) {
    const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          refreshedCookies.push(...cookiesToSet)
        },
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    currentUser = user
  }

  // ── Step 2: determine org context ─────────────────────────────────────────
  let orgId: string | null = null
  let isImpersonating = false

  if (isAppDomain) {
    // Super-admin domain — only honor impersonation cookie when the signed-in
    // user is a verified platform admin (app_metadata.is_platform_admin = true,
    // set exclusively via the service role — users cannot self-assign this).
    const impersonateOrgId = request.cookies.get('fieldday_impersonate_org_id')?.value
    const isPlatformAdmin = currentUser?.app_metadata?.is_platform_admin === true
    if (impersonateOrgId && isPlatformAdmin) {
      orgId = impersonateOrgId
      isImpersonating = true
    } else if (impersonateOrgId && !isPlatformAdmin) {
      // Cookie present but user is not a platform admin — silently ignore and
      // clear the cookie on the response so it can't be replayed.
      console.warn('[proxy] impersonation attempted by non-admin user — ignoring')
    }
  } else if (baseHost === PLATFORM_DOMAIN || baseHost === 'localhost' || baseHost === '127.0.0.1') {
    // Marketing site or local dev
    const devOrgId = process.env.DEV_ORG_ID
    if (devOrgId) orgId = devOrgId
  } else {
    // Org subdomain / custom domain
    orgId = await resolveOrgIdCached(baseHost)
    if (!orgId) {
      return new NextResponse('Organization not found', { status: 404 })
    }
  }

  // ── Step 2b: org-only routes need an org ──────────────────────────────────
  // On the platform apex and the app. domain (no impersonation) orgId is null;
  // letting /admin, /dashboard, etc. through used to reach getCurrentOrg and
  // throw a 500 (error emails from crawlers hitting fielddayapp.ca/admin).
  // 404 those at the edge. Auth pages (/login, /register, /choose-org) and
  // the super console stay reachable — they tolerate a missing org.
  if (!orgId) {
    const ORG_ONLY_PREFIXES = [
      '/admin', '/dashboard', '/my-events', '/my-teams', '/profile', '/shop',
      '/reconsent', '/events', '/teams', '/players', '/champions', '/gallery',
      '/games', '/schedule', '/standings', '/checkin', '/goodbye', '/invite',
      '/join', '/organizer-invite', '/sub-invite', '/unsubscribe', '/register/',
    ]
    const { pathname } = request.nextUrl
    const orgOnly = ORG_ONLY_PREFIXES.some((prefix) =>
      prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
    if (orgOnly) {
      return new NextResponse('Not found', { status: 404 })
    }
  }

  // ── Step 3: build request headers (with org context) ─────────────────────
  const requestHeaders = new Headers(request.headers)
  // Drop any client-supplied org header before setting our own. On hosts where
  // no org resolves (the marketing apex), a spoofed x-org-id would otherwise
  // pass straight through to the app, which has many direct readers.
  requestHeaders.delete('x-org-id')
  // Same for x-impersonating: the admin layout and billing actions skip the
  // membership check when it's '1', so a client-sent copy must never survive —
  // only a verified platform admin's impersonation (above) may set it.
  requestHeaders.delete('x-impersonating')
  if (orgId) requestHeaders.set('x-org-id', orgId)
  if (isImpersonating) requestHeaders.set('x-impersonating', '1')
  // Expose the full pathname+search so server components can build return-to URLs
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)

  // ── Step 4: the response, carrying any refreshed session cookies ─────────
  // Auth routes never get cookie writes from here (see Step 1).
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (!isAuthRoute) {
    refreshedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  }

  // If an unauthorised impersonation attempt was detected, clear the cookie
  if (request.cookies.get('fieldday_impersonate_org_id')?.value && !isImpersonating) {
    response.cookies.delete('fieldday_impersonate_org_id')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
