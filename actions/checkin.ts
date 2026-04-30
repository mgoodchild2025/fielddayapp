'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

export type CheckInResult =
  | { status: 'success'; playerName: string; teamName: string | null }
  | { status: 'already_checked_in'; playerName: string; checkedInAt: string }
  | { status: 'wrong_event' }
  | { status: 'not_found' }
  | { status: 'unauthorized' }

// Rep or admin scans a player's QR — token comes from the URL embedded in the QR
export async function checkInByToken(
  token: string,
  leagueId?: string,   // optional — pass from admin page to guard against wrong-event scans
): Promise<CheckInResult> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'unauthorized' }

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg } = await (db as any)
    .from('registrations')
    .select(`
      id, league_id, checked_in_at, checked_in_by,
      profile:profiles!registrations_user_id_fkey(full_name),
      team:team_members!team_members_user_id_fkey(
        team:teams!team_members_team_id_fkey(name, league_id)
      )
    `)
    .eq('checkin_token', token)
    .maybeSingle()

  if (!reg) return { status: 'not_found' }

  if (leagueId && reg.league_id !== leagueId) return { status: 'wrong_event' }

  if (reg.checked_in_at) {
    const profileData = Array.isArray(reg.profile) ? reg.profile[0] : reg.profile
    return {
      status: 'already_checked_in',
      playerName: profileData?.full_name ?? 'Unknown',
      checkedInAt: reg.checked_in_at,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('registrations')
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
    .eq('id', reg.id)

  if (error) return { status: 'not_found' }

  const profileData = Array.isArray(reg.profile) ? reg.profile[0] : reg.profile
  const teamMembers = Array.isArray(reg.team) ? reg.team : (reg.team ? [reg.team] : [])
  const teamEntry = teamMembers.find((tm: { team: { league_id: string; name: string } | null }) => {
    const t = Array.isArray(tm.team) ? tm.team[0] : tm.team
    return t?.league_id === reg.league_id
  })
  const teamData = teamEntry ? (Array.isArray(teamEntry.team) ? teamEntry.team[0] : teamEntry.team) : null

  if (leagueId) revalidatePath(`/admin/events/${leagueId}/checkin`)
  return {
    status: 'success',
    playerName: profileData?.full_name ?? 'Unknown',
    teamName: teamData?.name ?? null,
  }
}

// Player self-checks in via their own QR link (no auth required)
export async function selfCheckIn(token: string): Promise<CheckInResult> {
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg } = await (db as any)
    .from('registrations')
    .select('id, league_id, checked_in_at, profile:profiles!registrations_user_id_fkey(full_name)')
    .eq('checkin_token', token)
    .maybeSingle()

  if (!reg) return { status: 'not_found' }

  if (reg.checked_in_at) {
    const profileData = Array.isArray(reg.profile) ? reg.profile[0] : reg.profile
    return {
      status: 'already_checked_in',
      playerName: profileData?.full_name ?? 'Unknown',
      checkedInAt: reg.checked_in_at,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('registrations')
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: null })
    .eq('id', reg.id)

  const profileData = Array.isArray(reg.profile) ? reg.profile[0] : reg.profile
  return {
    status: 'success',
    playerName: profileData?.full_name ?? 'Unknown',
    teamName: null,
  }
}

// Admin resets a check-in (correction)
export async function undoCheckIn(registrationId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('registrations')
    .update({ checked_in_at: null, checked_in_by: null })
    .eq('id', registrationId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/checkin`)
  return { error: null }
}
