import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'

export default async function SchedulePage() {
  const headersList = headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url')
    .eq('organization_id', org.id)
    .single()

  const { data: games } = await supabase
    .from('games')
    .select(`
      id, scheduled_at, court, status, week_number,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      league:leagues!games_league_id_fkey(id, name, slug),
      game_results(home_score, away_score, status)
    `)
    .eq('organization_id', org.id)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold uppercase mb-8" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          Schedule
        </h1>
        {games && games.length > 0 ? (
          <div className="space-y-3">
            {games.map((game) => {
              const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
              const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
              const league = Array.isArray(game.league) ? game.league[0] : game.league
              return (
                <div key={game.id} className="bg-white rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">{new Date(game.scheduled_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(game.scheduled_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}{game.court ? ` · Court ${game.court}` : ''}</p>
                    <p className="font-semibold mt-1">{homeTeam?.name ?? 'TBD'} <span className="text-gray-400 font-normal">vs</span> {awayTeam?.name ?? 'TBD'}</p>
                    {league && <p className="text-xs text-gray-400 mt-0.5">{league.name}</p>}
                  </div>
                  <div className="text-sm text-gray-500 shrink-0">
                    {game.status === 'completed' ? (
                      <span className="text-green-600 font-medium">Final</span>
                    ) : (
                      <span className="capitalize">{game.status}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-16">No upcoming games scheduled.</p>
        )}
      </div>
      <Footer org={org} />
    </div>
  )
}
