import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { OnboardingChecklist } from '@/components/admin/onboarding-checklist'

export default async function AdminDashboardPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  // Service role client for queries that require bypassing RLS (org_members,
  // subscriptions, payments — tables where RLS requires app.current_org_id to
  // be set in the Postgres session, which the session client does not provide).
  const db = createServiceRoleClient()

  // League admins don't have access to the dashboard — send them to events
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (db as any).from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single()
    if (m?.role === 'league_admin') redirect('/admin/events')
  }

  // Upcoming events window: now → 7 days out
  const now7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [
    { count: leagueCount },
    { count: memberCount },
    { data: recentPayments },
    { data: activeLeagues },
    { data: branding },
    { data: upcomingGames },
    { data: upcomingSessions },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).is('deleted_at', null).neq('status', 'archived'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('payments').select('amount_cents, currency, status, created_at, user_id').eq('organization_id', org.id).order('created_at', { ascending: false }).limit(5),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('id, name, slug, status').eq('organization_id', org.id).is('deleted_at', null).in('status', ['registration_open', 'active']).limit(5),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, onboarding_dismissed_at, website_configured_at, timezone').eq('organization_id', org.id).maybeSingle(),
    // Games in the next 7 days
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('games')
      .select('id, scheduled_at, court, status, home_team:teams!games_home_team_id_fkey(name), away_team:teams!games_away_team_id_fkey(name), league:leagues!games_league_id_fkey(id, name, game_start_time, game_end_time)')
      .eq('organization_id', org.id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', now7d.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),
    // Sessions in the next 7 days
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('event_sessions')
      .select('id, scheduled_at, duration_minutes, capacity, league:leagues!event_sessions_league_id_fkey(id, name, game_start_time, game_end_time)')
      .eq('organization_id', org.id)
      .eq('status', 'open')
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', now7d.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tz: string = (branding as any)?.timezone ?? 'America/Toronto'
  const localDate = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
  const timeStr = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
      .format(new Date(iso))

  // Format HH:MM:SS time as "7:00 PM"
  const fmtLeagueTime = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const hr = h % 12 || 12
    return `${hr}${m ? `:${String(m).padStart(2, '0')}` : ''} ${period}`
  }
  const leagueTimeRange = (league: { game_start_time?: string | null; game_end_time?: string | null } | null) => {
    if (!league) return ''
    const s = league.game_start_time
    const e = league.game_end_time
    if (s && e) return ` · ${fmtLeagueTime(s)} – ${fmtLeagueTime(e)}`
    if (s) return ` · from ${fmtLeagueTime(s)}`
    if (e) return ` · until ${fmtLeagueTime(e)}`
    return ''
  }

  // Merge + group by local date
  type UpcomingItem = { id: string; scheduled_at: string; localDate: string; type: 'game' | 'session'; label: string; sub: string; leagueId: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingItems: UpcomingItem[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(upcomingGames ?? []).map((g: any) => {
      const home = Array.isArray(g.home_team) ? g.home_team[0] : g.home_team
      const away = Array.isArray(g.away_team) ? g.away_team[0] : g.away_team
      const league = Array.isArray(g.league) ? g.league[0] : g.league
      return {
        id: g.id, scheduled_at: g.scheduled_at, localDate: localDate(g.scheduled_at),
        type: 'game' as const,
        label: `${home?.name ?? 'TBD'} vs ${away?.name ?? 'TBD'}`,
        sub: `${timeStr(g.scheduled_at)}${g.court ? ` · ${g.court}` : ''}${leagueTimeRange(league)} · ${league?.name ?? ''}`,
        leagueId: league?.id ?? '',
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(upcomingSessions ?? []).map((s: any) => {
      const league = Array.isArray(s.league) ? s.league[0] : s.league
      return {
        id: s.id, scheduled_at: s.scheduled_at, localDate: localDate(s.scheduled_at),
        type: 'session' as const,
        label: 'Pickup Session',
        sub: `${timeStr(s.scheduled_at)}${s.capacity ? ` · ${s.capacity} spots` : ''}${leagueTimeRange(league)} · ${league?.name ?? ''}`,
        leagueId: league?.id ?? '',
      }
    }),
  ].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  // Group by localDate, cap at 5 distinct dates
  const upcomingByDate = new Map<string, UpcomingItem[]>()
  for (const item of upcomingItems) {
    if (!upcomingByDate.has(item.localDate)) upcomingByDate.set(item.localDate, [])
    upcomingByDate.get(item.localDate)!.push(item)
  }
  const upcomingDates = [...upcomingByDate.keys()].slice(0, 5)

  const todayLocalStr = localDate(new Date().toISOString())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalRevenue = recentPayments?.filter((p: any) => p.status === 'paid').reduce((acc: number, p: any) => acc + p.amount_cents, 0) ?? 0

  // Onboarding checklist — compute completion and visibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = branding as any
  const checklistDismissed = !!b?.onboarding_dismissed_at
  const checklistData = {
    logoSet:           !!b?.logo_url,
    websiteConfigured: !!b?.website_configured_at,
    eventCreated:      (leagueCount ?? 0) > 0,
  }
  const allChecklistDone = checklistData.logoSet && checklistData.websiteConfigured && checklistData.eventCreated
  const showChecklist = !checklistDismissed && !allChecklistDone

  const stats = [
    { label: 'Active Events', shortLabel: 'Events', value: leagueCount ?? 0, href: '/admin/events' },
    { label: 'Members', shortLabel: 'Members', value: memberCount ?? 0, href: '/admin/players' },
    { label: 'Recent Revenue', shortLabel: 'Revenue', value: `$${(totalRevenue / 100).toFixed(0)}`, href: '/admin/payments' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{org.name} — Dashboard</h1>

      {showChecklist && (
        <div className="mb-6">
          <OnboardingChecklist data={checklistData} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-lg border p-3 sm:p-5 hover:shadow-sm transition-shadow">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight">
              <span className="sm:hidden">{s.shortLabel}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </p>
            <p className="text-xl sm:text-3xl font-bold mt-0.5 sm:mt-1 tabular-nums" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {s.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Active Events</h2>
            <Link href="/admin/events" className="text-sm hover:underline" style={{ color: 'var(--brand-primary)' }}>View all</Link>
          </div>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(activeLeagues as any[])?.map((l: any) => (
              <Link key={l.id} href={`/admin/events/${l.id}`} className="flex items-center justify-between py-2 border-b last:border-0 hover:opacity-70">
                <span className="font-medium">{l.name}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${l.status === 'registration_open' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {l.status === 'registration_open' ? 'Open' : 'In Season'}
                </span>
              </Link>
            ))}
            {(!activeLeagues || activeLeagues.length === 0) && (
              <p className="text-sm text-gray-400 py-4 text-center">No active leagues</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Payments</h2>
            <Link href="/admin/payments" className="text-sm hover:underline" style={{ color: 'var(--brand-primary)' }}>View all</Link>
          </div>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(recentPayments as any[])?.map((p: any) => (
              <div key={p.created_at} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-600">{new Date(p.created_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                  <span className="font-semibold">${(p.amount_cents / 100).toFixed(0)}</span>
                </div>
              </div>
            ))}
            {(!recentPayments || recentPayments.length === 0) && (
              <p className="text-sm text-gray-400 py-4 text-center">No payments yet</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Upcoming schedule widget ────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-lg border">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold">Upcoming Schedule</h2>
            <span className="text-xs text-gray-400">next 7 days</span>
          </div>
          <Link
            href="/admin/calendar"
            className="text-sm font-medium hover:underline flex items-center gap-1"
            style={{ color: 'var(--brand-primary)' }}
          >
            Full calendar →
          </Link>
        </div>

        {upcomingDates.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No games or sessions in the next 7 days.
          </p>
        ) : (
          <div className="divide-y">
            {upcomingDates.map((dateStr) => {
              const items = upcomingByDate.get(dateStr) ?? []
              const [y, m, d] = dateStr.split('-').map(Number)
              const isToday = dateStr === todayLocalStr
              const isTomorrow = dateStr === (() => {
                const t = new Date(); t.setDate(t.getDate() + 1)
                return localDate(t.toISOString())
              })()
              const dayLabel = isToday ? 'Today'
                : isTomorrow ? 'Tomorrow'
                : new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
                    .format(Date.UTC(y, m - 1, d))

              // Calendar link for this date
              const ym = `${y}-${String(m).padStart(2, '0')}`
              const calLink = `/admin/calendar?month=${ym}&day=${dateStr}`

              return (
                <div key={dateStr} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Link href={calLink} className="text-xs font-semibold text-gray-500 uppercase tracking-wide hover:underline">
                      {dayLabel}
                    </Link>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{items.length} event{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.slice(0, 3).map((item) => (
                      <Link
                        key={item.id}
                        href={`/admin/events/${item.leagueId}/schedule`}
                        className="flex items-center gap-3 group"
                      >
                        <span className={`shrink-0 w-1 h-full min-h-[1.5rem] rounded-full ${item.type === 'session' ? 'bg-orange-400' : 'bg-[var(--brand-primary)]'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate group-hover:underline leading-tight">
                            {item.label}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                        </div>
                      </Link>
                    ))}
                    {items.length > 3 && (
                      <Link href={calLink} className="text-xs text-gray-400 hover:underline pl-4">
                        +{items.length - 3} more on this day →
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
