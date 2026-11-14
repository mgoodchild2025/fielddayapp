import { createServiceRoleClient } from '@/lib/supabase/service'

export type ScorekeeperEvent = { leagueId: string; leagueName: string; leagueStatus: string | null }

/** Events this user is an active scorekeeper for in this org (not archived). */
export async function getMyScorekeeperEvents(orgId: string, userId: string): Promise<ScorekeeperEvent[]> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('event_scorekeepers')
    .select('league:leagues!event_scorekeepers_league_id_fkey(id, name, status)')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
  return (data ?? [])
    .map((r) => (Array.isArray(r.league) ? r.league[0] : r.league) as { id: string; name: string; status: string | null } | null)
    .filter((l): l is { id: string; name: string; status: string | null } => !!l && l.status !== 'archived')
    .map((l) => ({ leagueId: l.id, leagueName: l.name, leagueStatus: l.status }))
}
