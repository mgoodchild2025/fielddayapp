import { headers } from 'next/headers'

// Served as a route handler (not app/robots.ts) because the Sitemap line must
// reference the request's own host — this app answers on the platform apex,
// every org subdomain, and org custom domains, and a cross-host sitemap URL
// is ignored by crawlers. Cloudflare prepends its content-signals block to
// whatever we serve here.
export async function GET() {
  const headersList = await headers()
  const host = headersList.get('host') ?? 'fielddayapp.ca'

  const body = [
    'User-agent: *',
    // Content signals (contentsignals.org): allow search indexing and AI
    // answer-engine use (citations drive discovery). ai-train deliberately
    // left unset — neither granted nor restricted.
    'Content-Signal: search=yes, ai-input=yes',
    // The org-branded PWA manifest lives under /api but should stay fetchable.
    'Allow: /api/manifest',
    // Admin & platform surfaces
    'Disallow: /admin',
    'Disallow: /super',
    'Disallow: /api',
    // Logged-in player surfaces
    'Disallow: /dashboard',
    'Disallow: /profile',
    // Auth, invite, and utility flows — real pages, but noise in an index
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /signup',
    'Disallow: /reset-password',
    'Disallow: /auth',
    'Disallow: /mfa',
    'Disallow: /choose-org',
    'Disallow: /reaccept',
    'Disallow: /checkin',
    'Disallow: /invite',
    'Disallow: /join',
    'Disallow: /sub-invite',
    'Disallow: /organizer-invite',
    'Disallow: /unsubscribe',
    'Disallow: /goodbye',
    '',
    `Sitemap: https://${host}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
