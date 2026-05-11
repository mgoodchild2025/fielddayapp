import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import Link from 'next/link'

export default async function JoinTeamPage({
  params,
}: {
  params: Promise<{ teamCode: string }>
}) {
  const { teamCode } = await params
  const code = teamCode.trim().toUpperCase()

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const [{ data: { user } }, { data: branding }] = await Promise.all([
    supabase.auth.getUser(),
    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
  ])

  const logoUrl = (branding as { logo_url?: string | null } | null)?.logo_url ?? null

  // Look up team by code
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: team } = await (db as any)
    .from('teams')
    .select(`
      id, name, color, logo_url, team_code,
      league:leagues!teams_league_id_fkey(id, name, slug, sport, max_team_size)
    `)
    .eq('team_code', code)
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .single()

  if (!team) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <OrgNav org={org} logoUrl={logoUrl} />
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="text-2xl font-bold">Team Not Found</p>
          <p className="text-gray-500 text-sm">
            This team code is invalid or the team is no longer accepting players.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
            ← Back to home
          </Link>
        </div>
        <Footer org={org} />
      </div>
    )
  }

  const league = Array.isArray(team.league) ? team.league[0] : team.league
  const leagueName: string = (league as { name?: string } | null)?.name ?? ''
  const leagueSlug: string = (league as { slug?: string } | null)?.slug ?? ''
  const maxTeamSize: number | null = (league as { max_team_size?: number | null } | null)?.max_team_size ?? null

  // Check current team size
  const { count: memberCount } = await db
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', team.id)
    .eq('status', 'active')

  const isFull = maxTeamSize !== null && (memberCount ?? 0) >= maxTeamSize

  // If logged in, check if already on the team
  let alreadyMember = false
  if (user) {
    const { data: membership } = await db
      .from('team_members')
      .select('id')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    alreadyMember = !!membership
  }

  const returnPath = `/join/${code}`

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />

      <div className="max-w-md mx-auto px-4 py-12">
        {/* Card */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {/* Team colour bar */}
          {team.color && (
            <div className="h-2" style={{ backgroundColor: team.color }} />
          )}

          <div className="px-6 py-8 text-center space-y-1">
            {/* Team avatar */}
            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4"
              style={{ backgroundColor: team.color ?? '#6b7280' }}
            >
              {team.name.charAt(0).toUpperCase()}
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{org.name}</p>
            <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
            {leagueName && (
              <p className="text-sm text-gray-500">{leagueName}</p>
            )}
            {maxTeamSize != null && (
              <p className="text-xs text-gray-400 mt-1">
                {memberCount ?? 0} / {maxTeamSize} players
              </p>
            )}
          </div>

          <div className="px-6 pb-8 space-y-4">
            {alreadyMember ? (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  ✓ You&apos;re already on this team.
                </p>
                <Link
                  href={`/teams/${team.id}`}
                  className="block w-full py-3 rounded-lg font-bold text-white text-sm text-center transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  View Team →
                </Link>
              </div>
            ) : isFull ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
                This team is full and not accepting new players.
              </p>
            ) : user ? (
              <Link
                href={leagueSlug ? `/register/${leagueSlug}?code=${code}` : `/teams/${team.id}`}
                className="block w-full py-3 rounded-lg font-bold text-white text-sm text-center transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Accept Invitation →
              </Link>
            ) : (
              <div className="space-y-3">
                <Link
                  href={`/login?redirect=${encodeURIComponent(leagueSlug ? `/register/${leagueSlug}?code=${code}` : returnPath)}`}
                  className="block w-full py-3 rounded-lg font-bold text-white text-sm text-center transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Sign in to accept
                </Link>
                <Link
                  href={`/register?redirect=${encodeURIComponent(leagueSlug ? `/register/${leagueSlug}?code=${code}` : returnPath)}`}
                  className="block w-full py-2.5 rounded-lg font-semibold text-sm text-center border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Create account
                </Link>
                <p className="text-center text-xs text-gray-400">
                  You need an account to accept this invitation.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer org={org} />
    </div>
  )
}
