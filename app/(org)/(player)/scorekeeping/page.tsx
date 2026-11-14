import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'
import { getCurrentOrg, getOrgTimezone } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { redirectToLogin } from '@/lib/auth'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { EmptyState } from '@/components/ui/empty-state'
import { loadCourtsideDay } from '@/lib/courtside-day'
import { COURT_COOKIE, readCourtCookie } from '@/lib/courtside-order'
import { CourtsideLists } from '@/components/courtside/courtside-lists'
import { getMyScorekeeperEvents } from '@/lib/scorekeeper-events'

export const metadata: Metadata = { title: 'Scorekeeping' }

/**
 * Scorekeeping — Courtside for volunteers: the day's games and playoff matches
 * of the events they keep score for, and nothing else of the admin panel.
 */
export default async function ScorekeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const db = createServiceRoleClient()
  const [tz, events, { data: branding }, { data: member }, params] = await Promise.all([
    getOrgTimezone(org.id),
    getMyScorekeeperEvents(org.id, user.id),
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).maybeSingle(),
    db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    searchParams,
  ])
  const isOrganiser = member?.role === 'org_admin' || member?.role === 'league_admin'

  const day = events.length > 0
    ? await loadCourtsideDay({ orgId: org.id, tz, dateParam: params.date, leagueIds: events.map((e) => e.leagueId) })
    : null

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">
        <div className="max-w-xl mx-auto w-full px-4 py-6 pb-24">
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--brand-heading-font)' }}>Scorekeeping</h1>
          {events.length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5 mb-4">{events.map((e) => e.leagueName).join(' · ')}</p>
          )}

          {isOrganiser && (
            <p className="text-sm text-gray-600 mb-4">
              Organisers score from{' '}
              <Link href="/admin/courtside" className="font-semibold underline text-brand-ink">Courtside</Link>.
            </p>
          )}

          {!day ? (
            <EmptyState
              icon={ClipboardList}
              title="You’re not keeping score for any event"
              hint="An organiser can invite you as a scorekeeper from their event page."
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <Link href={`/scorekeeping?date=${day.prevDate}`} aria-label="Previous day"
                  className="press inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border bg-white text-gray-600 font-bold">‹</Link>
                <div className="text-center">
                  <p className="text-sm font-semibold">{day.dayLabel}</p>
                  {day.date !== day.todayLocal && (
                    <Link href="/scorekeeping" className="inline-flex items-center min-h-10 text-sm font-medium underline text-brand-ink">Back to today</Link>
                  )}
                </div>
                <Link href={`/scorekeeping?date=${day.nextDate}`} aria-label="Next day"
                  className="press inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border bg-white text-gray-600 font-bold">›</Link>
              </div>
              <CourtsideLists day={day} tz={tz} canClear={false} emptyHint="Use the arrows above to check another day." initialCourt={readCourtCookie((await cookies()).get(COURT_COOKIE)?.value, day.date)} />
            </>
          )}
        </div>
      </main>
      <Footer org={org} />
    </div>
  )
}
