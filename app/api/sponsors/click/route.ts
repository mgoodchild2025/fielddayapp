import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Sponsor click tracker. Logs a click (per-day aggregate) then 302s to the
 * sponsor's website. Usage: /api/sponsors/click?l=<leagueId>&k=<sponsorKey>&u=<url>
 */
export async function GET(request: NextRequest) {
  const orgId = request.headers.get('x-org-id')
  const leagueId = request.nextUrl.searchParams.get('l')
  const key = request.nextUrl.searchParams.get('k')
  const to = request.nextUrl.searchParams.get('u')

  // Validate destination — only allow absolute http(s) URLs
  let dest: string | null = null
  if (to) {
    try {
      const u = new URL(to)
      if (u.protocol === 'http:' || u.protocol === 'https:') dest = u.toString()
    } catch { /* invalid */ }
  }

  if (orgId && leagueId && key) {
    try {
      const db = createServiceRoleClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).rpc('bump_sponsor_stats', { p_org: orgId, p_league: leagueId, p_keys: [key], p_kind: 'click' })
    } catch {
      // never block the redirect on analytics
    }
  }

  if (!dest) return new NextResponse('Invalid link', { status: 400 })
  return NextResponse.redirect(dest, { status: 302 })
}
