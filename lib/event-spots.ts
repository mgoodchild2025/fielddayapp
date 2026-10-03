import type { createServiceRoleClient } from '@/lib/supabase/service'

/** Live capacity for an event card's "Open / Only N left / Full" label. */
export type EventSpots = { filled: number; max: number | null; unit: 'team' | 'player' }

type Db = ReturnType<typeof createServiceRoleClient>

type SpotsLeague = {
  id: string
  payment_mode: string | null
  event_type: string | null
  max_teams: number | null
  max_participants: number | null
}

/**
 * One spots entry per open event — shared by the home page's Open Events
 * cards and the /events page. per_team → team count vs max_teams;
 * per-player → active/pending registrations vs max_participants. Drop-in
 * events are excluded: their capacity is PER SESSION, so an event-wide
 * registration count vs max_participants (the per-session cap) reads a few
 * part-full sessions as "Full" — their cards show "Open" and the event page
 * shows real per-session spots.
 */
export async function getEventSpotsMap(db: Db, leagues: SpotsLeague[]): Promise<Map<string, EventSpots>> {
  const perTeamIds = leagues.filter((l) => l.payment_mode === 'per_team').map((l) => l.id)
  const perPlayerIds = leagues
    .filter((l) => l.payment_mode !== 'per_team' && l.event_type !== 'drop_in' && l.max_participants !== null)
    .map((l) => l.id)

  // Counted in the database, one head-only count per event (index-backed) —
  // downloading rows to count them would also undercount past the 1000-row cap
  // and show a full event as open.
  const teamCount = new Map<string, number>()
  const regCount = new Map<string, number>()
  await Promise.all([
    ...perTeamIds.map((id) =>
      db.from('teams').select('id', { count: 'exact', head: true }).eq('league_id', id)
        .then(({ count }) => { teamCount.set(id, count ?? 0) })),
    ...perPlayerIds.map((id) =>
      db.from('registrations').select('id', { count: 'exact', head: true }).eq('league_id', id).in('status', ['active', 'pending'])
        .then(({ count }) => { regCount.set(id, count ?? 0) })),
  ])

  const spots = new Map<string, EventSpots>()
  for (const l of leagues) {
    if (l.payment_mode === 'per_team') {
      spots.set(l.id, { filled: teamCount.get(l.id) ?? 0, max: l.max_teams, unit: 'team' })
    } else if (l.event_type !== 'drop_in') {
      spots.set(l.id, { filled: regCount.get(l.id) ?? 0, max: l.max_participants, unit: 'player' })
    }
  }
  return spots
}
