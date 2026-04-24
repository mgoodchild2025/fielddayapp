import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const baseHost = hostname.split(':')[0] // strip port for local dev

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Refresh Supabase session (anon key, for auth cookie management)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  // Platform super admin
  if (baseHost === `app.${PLATFORM_DOMAIN}` || baseHost === 'app.localhost') {
    return response
  }

  // Marketing site (or local dev with a hardcoded org)
  if (baseHost === PLATFORM_DOMAIN || baseHost === 'localhost' || baseHost === '127.0.0.1') {
    const devOrgId = process.env.DEV_ORG_ID
    if (devOrgId) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-org-id', devOrgId)
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    return response
  }

  // Subdomain: extract org slug
  let orgId: string | null = null

  const subdomainMatch =
    baseHost.match(new RegExp(`^([^.]+)\\.${PLATFORM_DOMAIN.replace('.', '\\.')}$`)) ??
    baseHost.match(/^([^.]+)\.localhost$/)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  if (subdomainMatch) {
    const slug = subdomainMatch[1]
    const url = `${supabaseUrl}/rest/v1/organizations?slug=eq.${slug}&status=eq.active&select=id&limit=1`
    try {
      const res = await fetch(url, { headers: restHeaders })
      const [org] = await res.json()
      orgId = org?.id ?? null
    } catch (err) {
      console.error('[proxy] org lookup error:', err)
    }
  } else {
    // Custom domain lookup
    const res = await fetch(
      `${supabaseUrl}/rest/v1/org_branding?custom_domain=eq.${baseHost}&select=organization_id&limit=1`,
      { headers: restHeaders }
    )
    const [branding] = await res.json()
    if (branding?.organization_id) {
      const res2 = await fetch(
        `${supabaseUrl}/rest/v1/organizations?id=eq.${branding.organization_id}&status=eq.active&select=id&limit=1`,
        { headers: restHeaders }
      )
      const [org] = await res2.json()
      orgId = org?.id ?? null
    }
  }

  if (!orgId) {
    return new NextResponse('Organization not found', { status: 404 })
  }

  // Inject org context header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-org-id', orgId)

  response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Re-apply session cookies to new response
  supabase.auth.getUser().then(() => {})

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
