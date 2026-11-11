import { getCurrentOrg } from '@/lib/tenant'
import { getOrgBrandingCached } from '@/lib/org-cache'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

type HeadersLike = Parameters<typeof getCurrentOrg>[0]

const bare = (host: string) => host.toLowerCase().split(':')[0].replace(/^www\./, '')

/**
 * The origin for links we put in EMAILS (password reset, confirmation, invites,
 * admin alerts). Pure, so it can be tested.
 *
 * It is never taken from Referer, Origin or x-forwarded-host: a scripted request
 * sets those to anything, and a reset link built from them sent the victim's
 * token to the attacker's site. Only what the proxy established is used — the
 * org, and the Host header when it is one of that org's own hosts (its
 * subdomain or its custom domain). Anything else gets the org's subdomain.
 */
export function pickTrustedOrigin(input: {
  host: string | null
  orgSlug: string | null
  customDomain: string | null
  platformDomain: string
  isDev: boolean
}): string {
  const host = (input.host ?? '').toLowerCase()
  const baseHost = host.split(':')[0]

  if (input.isDev && (baseHost === 'localhost' || baseHost === '127.0.0.1' || baseHost.endsWith('.localhost'))) {
    return `http://${host}`
  }
  // No org: the app. host has the auth pages (the apex is the marketing site).
  if (!input.orgSlug) return `https://app.${input.platformDomain}`

  const subdomain = `${input.orgSlug}.${input.platformDomain}`
  if (baseHost && input.customDomain && bare(baseHost) === bare(input.customDomain)) {
    return `https://${baseHost}`
  }
  return `https://${subdomain}`
}

/** `pickTrustedOrigin` for the current request (`await headers()`). */
export async function trustedOrigin(headersList: HeadersLike): Promise<string> {
  let orgSlug: string | null = null
  let customDomain: string | null = null
  if (headersList.get('x-org-id')) {
    const org = await getCurrentOrg(headersList)
    orgSlug = org.slug
    customDomain = (await getOrgBrandingCached(org.id))?.custom_domain ?? null
  }
  return pickTrustedOrigin({
    host: headersList.get('host'),
    orgSlug,
    customDomain,
    platformDomain: PLATFORM_DOMAIN,
    isDev: process.env.NODE_ENV === 'development',
  })
}
