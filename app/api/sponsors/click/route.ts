import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getEventSponsors } from '@/actions/event-sponsors'

/**
 * Sponsor click tracker. Logs a click (per-day aggregate) then 302s to the
 * sponsor's website. Usage: /api/sponsors/click?l=<leagueId>&k=<sponsorKey>&u=<url>
 */
export async function GET(request: NextRequest) {
  const orgId = request.headers.get('x-org-id')
  const leagueId = request.nextUrl.searchParams.get('l')
  const key = request.nextUrl.searchParams.get('k')
  const to = request.nextUrl.searchParams.get('u')

  // Only ever redirect to a website this org saved for one of its sponsors.
  // Trusting `u` made this an open redirect: any https URL behind the org's
  // own domain, ready-made for a phishing link.
  let dest: string | null = null
  if (orgId && leagueId) {
    try {
      const sponsors = await getEventSponsors(leagueId, orgId)
      const byKey = key ? sponsors.find((sp) => sp.id === key)?.website_url : null
      const candidate = byKey ?? (to && sponsors.some((sp) => sp.website_url === to) ? to : null)
      if (candidate) {
        const u = new URL(candidate)
        if (u.protocol === 'http:' || u.protocol === 'https:') dest = u.toString()
      }
    } catch { /* invalid URL or lookup failure → 400 below */ }
  }

  if (orgId && leagueId && key) {
    try {
      const db = createServiceRoleClient()

      await db.rpc('bump_sponsor_stats', { p_org: orgId, p_league: leagueId, p_keys: [key], p_kind: 'click' })
    } catch {
      // never block the redirect on analytics
    }
  }

  if (!dest) return new NextResponse('Invalid link', { status: 400 })
  return NextResponse.redirect(dest, { status: 302 })
}
