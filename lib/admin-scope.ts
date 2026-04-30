import { createServerClient } from '@/lib/supabase/server'

export type AdminScope = {
  isOrgAdmin: boolean
  assignedLeagueIds: string[] | null // null = org_admin, sees all
}

/**
 * Returns the current user's admin scope for an org.
 * - org_admin → { isOrgAdmin: true, assignedLeagueIds: null }
 * - league_admin → { isOrgAdmin: false, assignedLeagueIds: [...] } (only their assigned events)
 *
 * Call this in admin server components to scope data queries.
 */
export async function getAdminScope(orgId: string): Promise<AdminScope> {
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { isOrgAdmin: false, assignedLeagueIds: [] }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member) return { isOrgAdmin: false, assignedLeagueIds: [] }

  if (member.role === 'org_admin') {
    return { isOrgAdmin: true, assignedLeagueIds: null }
  }

  // league_admin — fetch their specific event assignments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assignments } = await (supabase as any)
    .from('league_organizers')
    .select('league_id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('status', 'active')

  const ids = (assignments ?? []).map((a: { league_id: string }) => a.league_id)
  return { isOrgAdmin: false, assignedLeagueIds: ids }
}
