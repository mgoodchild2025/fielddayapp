import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { impersonationGrantsAdmin } from '@/lib/impersonation'
import { decideScoringRole, type ScoringRole } from '@/lib/scoring-role'

export type { ScoringRole } from '@/lib/scoring-role'

type Db = ReturnType<typeof createServiceRoleClient>

/**
 * Who may enter a confirmed score for a game or bracket match in this event?
 * The one check behind every score-saving action and the scoreboard's save
 * button (see lib/scoring-role.ts for the rule).
 */
export async function getScoringRole(
  db: Db,
  orgId: string,
  userId: string,
  leagueId: string | null,
  opts: { impersonating?: boolean } = {},
): Promise<ScoringRole | null> {
  if (opts.impersonating) return 'admin'
  const [{ data: member }, organizerRes, scorekeeperRes] = await Promise.all([
    db.from('org_members').select('role')
      .eq('organization_id', orgId).eq('user_id', userId).eq('status', 'active')
      .maybeSingle(),
    leagueId
      ? db.from('league_organizers').select('id')
          .eq('organization_id', orgId).eq('league_id', leagueId).eq('user_id', userId).eq('status', 'active')
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
    leagueId
      ? db.from('event_scorekeepers').select('id')
          .eq('organization_id', orgId).eq('league_id', leagueId).eq('user_id', userId).eq('status', 'active')
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])
  return decideScoringRole({
    orgRole: (member?.role as string | undefined) ?? null,
    organizerOfEvent: (organizerRes.data ?? []).length > 0,
    scorekeeperOfEvent: (scorekeeperRes.data ?? []).length > 0,
    hasEvent: !!leagueId,
  })
}

/**
 * For server actions: the signed-in caller's scoring role for one event, or an
 * error. Honours a verified platform admin impersonating the org, as the other
 * admin guards do.
 */
export async function requireScoringRole(
  orgId: string,
  leagueId: string | null,
): Promise<{ userId: string; email: string | null; role: ScoringRole } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const impersonating = impersonationGrantsAdmin((await headers()).get('x-impersonating'), user)
  const role = await getScoringRole(createServiceRoleClient(), orgId, user.id, leagueId, { impersonating })
  if (!role) return { error: 'Only this event’s organisers and scorekeepers can enter scores' }
  return { userId: user.id, email: user.email ?? null, role }
}
