import { createServiceRoleClient } from '@/lib/supabase/service'
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

/**
 * Permanently delete an event and all its child data. Plain (non-action)
 * helper so it can be called from authorized server actions and the cron
 * without exposing an unauthenticated server-action endpoint.
 */
export async function purgeLeagueData(
  orgId: string,
  leagueId: string,
  actorUserId: string | null,
  actorLabel: string | null,
): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('name').eq('id', leagueId).eq('organization_id', orgId).single()

  // Delete child records in safe order (cascade may not cover everything)
  await db.from('team_members').delete().eq('organization_id', orgId)
    .in('team_id',
      (await db.from('teams').select('id').eq('league_id', leagueId).eq('organization_id', orgId))
        .data?.map((t) => t.id) ?? []
    )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: brackets } = await (db as any).from('brackets').select('id').eq('league_id', leagueId).eq('organization_id', orgId)
  if (brackets && brackets.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('bracket_matches').delete().in('bracket_id', brackets.map((b: { id: string }) => b.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('brackets').delete().eq('league_id', leagueId).eq('organization_id', orgId)
  }

  await db.from('game_results').delete().eq('organization_id', orgId)
    .in('game_id',
      (await db.from('games').select('id').eq('league_id', leagueId).eq('organization_id', orgId))
        .data?.map((g) => g.id) ?? []
    )
  await db.from('teams').delete().eq('league_id', leagueId).eq('organization_id', orgId)
  await db.from('registrations').delete().eq('league_id', leagueId).eq('organization_id', orgId)
  await db.from('games').delete().eq('league_id', leagueId).eq('organization_id', orgId)
  await db.from('payments').delete().eq('league_id', leagueId).eq('organization_id', orgId)
  await db.from('announcements').delete().eq('league_id', leagueId).eq('organization_id', orgId)

  const { error } = await db.from('leagues').delete().eq('id', leagueId).eq('organization_id', orgId)
  if (error) return { error: error.message }

  await recordAuditLog({
    orgId,
    actorUserId,
    actorLabel,
    action: AUDIT_ACTIONS.EVENT_PURGED,
    targetType: 'league',
    targetId: leagueId,
    targetLabel: league?.name ?? null,
  })

  return { error: null }
}
