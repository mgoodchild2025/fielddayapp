import type { createServiceRoleClient } from '@/lib/supabase/service'
import type { MedalView } from '@/components/medals/medal-case'

/** Shared medal loaders for the dashboard, profile, and team pages. */

type Db = ReturnType<typeof createServiceRoleClient>

type MedalRow = {
  id: string
  placement: string
  label: string
  league_id: string
  league_name: string
  team_id: string | null
  team_name: string
  awarded_at: string
  medal_recipients: { display_name: string }[]
  league: { slug: string } | { slug: string }[] | null
}

function toView(m: MedalRow): MedalView {
  const league = Array.isArray(m.league) ? m.league[0] : m.league
  return {
    id: m.id,
    placement: m.placement as MedalView['placement'],
    label: m.label,
    leagueName: m.league_name,
    leagueSlug: league?.slug ?? null,
    teamName: m.team_name,
    teamId: m.team_id,
    awardedAt: m.awarded_at,
    teammates: (m.medal_recipients ?? []).map((r) => r.display_name),
  }
}

const MEDAL_SELECT = `
  id, placement, label, league_id, league_name, team_id, team_name, awarded_at,
  medal_recipients(display_name),
  league:leagues!medals_league_id_fkey(slug)
`

/** Every medal a player has earned in this org, newest first. */
export async function getPlayerMedals(db: Db, orgId: string, userId: string): Promise<MedalView[]> {
  const { data: mine } = await db
    .from('medal_recipients')
    .select('medal_id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
  const ids = [...new Set((mine ?? []).map((r) => r.medal_id))]
  if (ids.length === 0) return []

  const { data } = await db
    .from('medals')
    .select(MEDAL_SELECT)
    .in('id', ids)
    .order('awarded_at', { ascending: false })
  return ((data ?? []) as unknown as MedalRow[]).map(toView)
}

/** Every medal a team has won, newest first. */
export async function getTeamMedals(db: Db, orgId: string, teamId: string): Promise<MedalView[]> {
  const { data } = await db
    .from('medals')
    .select(MEDAL_SELECT)
    .eq('organization_id', orgId)
    .eq('team_id', teamId)
    .order('awarded_at', { ascending: false })
  return ((data ?? []) as unknown as MedalRow[]).map(toView)
}

/** Medal counts per user (for roster mini-icons): userId → placements earned. */
export async function getMedalCountsForUsers(
  db: Db,
  orgId: string,
  userIds: string[]
): Promise<Map<string, { gold: number; silver: number; bronze: number; tier_champion: number }>> {
  const counts = new Map<string, { gold: number; silver: number; bronze: number; tier_champion: number }>()
  if (userIds.length === 0) return counts

  const { data } = await db
    .from('medal_recipients')
    .select('user_id, medal:medals!medal_recipients_medal_id_fkey(placement)')
    .eq('organization_id', orgId)
    .in('user_id', userIds)

  for (const r of data ?? []) {
    if (!r.user_id) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const medal = Array.isArray(r.medal) ? r.medal[0] : r.medal as any
    const placement = medal?.placement as keyof ReturnType<typeof Object> | string | undefined
    if (!placement) continue
    const c = counts.get(r.user_id) ?? { gold: 0, silver: 0, bronze: 0, tier_champion: 0 }
    if (placement === 'gold' || placement === 'silver' || placement === 'bronze' || placement === 'tier_champion') {
      c[placement]++
    }
    counts.set(r.user_id, c)
  }
  return counts
}
