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

  const teamCount = new Map<string, number>()
  const regCount = new Map<string, number>()
  await Promise.all([
    perTeamIds.length > 0
      ? db.from('teams').select('league_id').in('league_id', perTeamIds)
          .then(({ data }) => {
            for (const t of (data ?? []) as { league_id: string }[]) {
              teamCount.set(t.league_id, (teamCount.get(t.league_id) ?? 0) + 1)
            }
          })
      : Promise.resolve(),
    perPlayerIds.length > 0
      ? db.from('registrations').select('league_id').in('league_id', perPlayerIds).in('status', ['active', 'pending'])
          .then(({ data }) => {
            for (const r of (data ?? []) as { league_id: string }[]) {
              regCount.set(r.league_id, (regCount.get(r.league_id) ?? 0) + 1)
            }
          })
      : Promise.resolve(),
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
