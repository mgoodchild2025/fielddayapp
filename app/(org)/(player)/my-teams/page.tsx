import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'

const ROLE_LABEL: Record<string, string> = {
  captain: 'Captain',
  player:  'Player',
  sub:     'Sub',
}

export default async function MyTeamsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: branding }, { data: memberships }] = await Promise.all([
    supabase.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    supabase.from('team_members').select(`
      id, role,
      team:teams!team_members_team_id_fkey(
        id, name, color, logo_url,
        league:leagues!teams_league_id_fkey(id, name, slug, status)
      )
    `)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = (memberships ?? []).map((m: any) => {
    const team = Array.isArray(m.team) ? m.team[0] : m.team
    const league = team ? (Array.isArray(team.league) ? team.league[0] : team.league) : null
    return { membershipId: m.id, role: m.role, team, league }
  }).filter((m: { team: unknown }) => m.team)

  // Group by league status: active/open first, then completed/archived
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active = teams.filter((m: any) =>
    ['active', 'registration_open'].includes(m.league?.status ?? '')
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const past = teams.filter((m: any) =>
    !['active', 'registration_open'].includes(m.league?.status ?? '')
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function TeamCard({ membershipId, role, team, league }: any) {
    return (
      <Link
        href={`/teams/${team.id}`}
        className="flex items-center gap-4 bg-white rounded-xl border px-4 py-4 hover:shadow-sm transition-shadow group"
      >
        <TeamAvatar name={team.name} color={team.color} logoUrl={team.logo_url} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 truncate">{team.name}</p>
            {role && role !== 'player' && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                {ROLE_LABEL[role] ?? role}
              </span>
            )}
          </div>
          {league && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{league.name}</p>
          )}
        </div>

        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <h1
          className="text-2xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          My Teams
        </h1>

        {teams.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <p className="text-gray-400 text-sm mb-3">You&apos;re not on any teams yet.</p>
            <Link
              href="/events"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Current
                </h2>
                <div className="space-y-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {active.map((m: any) => (
                    <TeamCard key={m.membershipId} {...m} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <PastGamesToggle count={past.length}>
                <div className="space-y-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {past.map((m: any) => (
                    <TeamCard key={m.membershipId} {...m} />
                  ))}
                </div>
              </PastGamesToggle>
            )}
          </div>
        )}
      </div>

      <Footer org={org} />
    </div>
  )
}
