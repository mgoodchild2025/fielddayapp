'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

export interface TeamMemberCheckinStatus {
  userId: string
  fullName: string
  registrationId: string
  checkedInAt: string | null
  waiverSigned: boolean
}

export interface TeamCheckinStatus {
  teamName: string
  members: TeamMemberCheckinStatus[]
}

export async function getTeamCheckinStatus(
  teamId: string,
  leagueId: string,
): Promise<{ data: TeamCheckinStatus | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthorized' }

  const db = createServiceRoleClient()

  // Fetch team name + verify it belongs to this org/league
  const { data: team } = await db
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .single()

  if (!team) return { data: null, error: 'Team not found' }

  // Fetch all active team members with their profiles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: members } = await (db as any)
    .from('team_members')
    .select('user_id, profile:profiles!team_members_user_id_fkey(full_name)')
    .eq('team_id', teamId)
    .eq('status', 'active')

  if (!members || members.length === 0) {
    return { data: { teamName: team.name, members: [] }, error: null }
  }

  const userIds: string[] = members.map((m: { user_id: string }) => m.user_id)

  // Fetch registrations for those users in this league
  const { data: regs } = await db
    .from('registrations')
    .select('id, user_id, checked_in_at, waiver_signature_id')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .in('status', ['active', 'pending'])
    .in('user_id', userIds)

  const regByUserId = new Map<string, { id: string; checked_in_at: string | null; waiver_signature_id: string | null }>()
  for (const r of (regs ?? [])) {
    regByUserId.set(r.user_id, r)
  }

  const result: TeamMemberCheckinStatus[] = members
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => {
      const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
      const reg = regByUserId.get(m.user_id)
      if (!reg) return null  // no registration for this league — skip
      return {
        userId: m.user_id,
        fullName: profile?.full_name ?? 'Unknown',
        registrationId: reg.id,
        checkedInAt: reg.checked_in_at,
        waiverSigned: !!reg.waiver_signature_id,
      }
    })
    .filter(Boolean) as TeamMemberCheckinStatus[]

  // Sort: not checked-in first, then alpha
  result.sort((a, b) => {
    if (!a.checkedInAt && b.checkedInAt) return -1
    if (a.checkedInAt && !b.checkedInAt) return 1
    return a.fullName.localeCompare(b.fullName)
  })

  return { data: { teamName: team.name, members: result }, error: null }
}

export async function toggleTeamMemberCheckin(
  registrationId: string,
  leagueId: string,
  checkIn: boolean,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()

  const { error } = await db
    .from('registrations')
    .update({
      checked_in_at: checkIn ? new Date().toISOString() : null,
      checked_in_by: checkIn ? user.id : null,
    } as never)
    .eq('id', registrationId)
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/checkin`)
  return { error: null }
}
