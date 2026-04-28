import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const REST_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

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

  // Custom domain
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/org_branding?custom_domain=eq.${baseHost}&select=organization_id&limit=1`,
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

  // ── Step 1: determine org context ─────────────────────────────────────────
  let orgId: string | null = null

  if (baseHost === `app.${PLATFORM_DOMAIN}` || baseHost === 'app.localhost') {
    // Super-admin domain — no org context needed
  } else if (baseHost === PLATFORM_DOMAIN || baseHost === 'localhost' || baseHost === '127.0.0.1') {
    // Marketing site or local dev
    const devOrgId = process.env.DEV_ORG_ID
    if (devOrgId) orgId = devOrgId
  } else {
    // Org subdomain / custom domain
    orgId = await resolveOrgId(baseHost)
    if (!orgId) {
      return new NextResponse('Organization not found', { status: 404 })
    }
  }

  // ── Step 2: build request headers (with org context) ─────────────────────
  const requestHeaders = new Headers(request.headers)
  if (orgId) requestHeaders.set('x-org-id', orgId)

  // ── Step 3: create the final response, then refresh the Supabase session ──
  // We do this in one pass so session-refresh cookies land on the correct
  // response object and aren't lost when we add the org header.
  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Write refreshed tokens back to the request so server components see them
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        // Rebuild response with the updated request AND keep the org header
        response = NextResponse.next({ request: { headers: requestHeaders } })
        // Set refreshed token cookies on the response
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // Calling getUser() triggers session refresh if needed (setAll runs if tokens changed)
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
