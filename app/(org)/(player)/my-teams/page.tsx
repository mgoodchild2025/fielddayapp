import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { PastGamesToggle } from '@/components/schedule/past-games-toggle'
import { redirectToLogin } from '@/lib/auth'
import { EmptyState } from '@/components/ui/empty-state'
import { Users } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'My teams' }

const ROLE_LABEL: Record<string, string> = {
  captain: 'Captain',
  player:  'Player',
  sub:     'Sub',
}

export default async function MyTeamsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const [{ data: branding }, { data: memberships }] = await Promise.all([

    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),

    db.from('team_members').select(`
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
            <p className="text-xs text-gray-500 mt-0.5 truncate">{league.name}</p>
          )}
        </div>

        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <h1
          className="text-2xl font-bold uppercase mb-6"
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          My Teams
        </h1>

        {teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="You're not on any teams yet"
            hint="Join one when you register for a team event, or with the join link your captain shares."
            action={{ href: '/events', label: 'Browse events' }}
          />
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
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
              <PastGamesToggle count={past.length} label="teams">
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

      </main>
      <Footer org={org} />
    </div>
  )
}
