'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

export type CheckInResult =
  | { status: 'success'; playerName: string; teamName: string | null }
  | { status: 'already_checked_in'; playerName: string; checkedInAt: string }
  | { status: 'not_registered_for_session'; playerName: string; registrationId: string }
  | { status: 'wrong_event' }
  | { status: 'not_found' }
  | { status: 'unauthorized' }

// Rep or admin scans a player's QR — token comes from the URL embedded in the QR.
// When sessionId is provided the check-in is recorded against session_registrations
// instead of the event-level registrations row.
export async function checkInByToken(
  token: string,
  leagueId?: string,   // optional — pass from admin page to guard against wrong-event scans
  sessionId?: string,  // optional — if provided, do per-session check-in
): Promise<CheckInResult> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'unauthorized' }

  const db = createServiceRoleClient()

  // Fetch registration + player profile only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg } = await (db as any)
    .from('registrations')
    .select(`
      id, league_id, user_id, checked_in_at, checked_in_by,
      profile:profiles!registrations_user_id_fkey(full_name)
    `)
    .eq('checkin_token', token)
    .maybeSingle()

  if (!reg) return { status: 'not_found' }
  if (leagueId && reg.league_id !== leagueId) return { status: 'wrong_event' }

  const profileData = Array.isArray(reg.profile) ? reg.profile[0] : reg.profile
  const playerName: string = profileData?.full_name ?? 'Unknown'

  // ── Per-session check-in path ──────────────────────────────────────────────
  if (sessionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionReg } = await (db as any)
      .from('session_registrations')
      .select('id, checked_in_at')
      .eq('session_id', sessionId)
      .eq('user_id', reg.user_id)
      .maybeSingle()

    if (!sessionReg) {
      // Player is a member of the event but not pre-registered for this session
      return { status: 'not_registered_for_session', playerName, registrationId: reg.id }
    }

    if (sessionReg.checked_in_at) {
      return { status: 'already_checked_in', playerName, checkedInAt: sessionReg.checked_in_at }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('session_registrations')
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
      .eq('id', sessionReg.id)

    if (error) return { status: 'not_found' }
    if (leagueId) revalidatePath(`/admin/events/${leagueId}/checkin`)
    return { status: 'success', playerName, teamName: null }
  }

  // ── Event-level check-in path (original behaviour) ────────────────────────
  if (reg.checked_in_at) {
    return {
      status: 'already_checked_in',
      playerName,
      checkedInAt: reg.checked_in_at,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('registrations')
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
    .eq('id', reg.id)

  if (error) return { status: 'not_found' }

  // Look up the player's team for this league separately
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teamMember } = await (db as any)
    .from('team_members')
    .select('team:teams!team_members_team_id_fkey(name, league_id)')
    .eq('user_id', reg.user_id)
    .eq('status', 'active')
    .maybeSingle()

  const teamData = teamMember
    ? (Array.isArray(teamMember.team) ? teamMember.team[0] : teamMember.team)
    : null
  const teamName = teamData?.league_id === reg.league_id ? (teamData?.name ?? null) : null

  if (leagueId) revalidatePath(`/admin/events/${leagueId}/checkin`)
  return { status: 'success', playerName, teamName }
}

// Admin adds a player as a walk-in for a session they didn't pre-register for.
// Creates a session_registration row (or updates an existing cancelled one) and marks checked-in.
export async function checkInWalkIn(
  registrationId: string,
  sessionId: string,
  leagueId: string,
): Promise<{ error: string | null; playerName: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', playerName: null }

  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reg } = await (db as any)
    .from('registrations')
    .select('id, user_id, organization_id, profile:profiles!registrations_user_id_fkey(full_name)')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found', playerName: null }

  const profileData = Array.isArray(reg.profile) ? reg.profile[0] : reg.profile
  const playerName: string = profileData?.full_name ?? 'Unknown'
  const now = new Date().toISOString()

  // Upsert: create a walk-in session_registration and mark it checked in.
  // If a cancelled row already exists, update it back to registered + checked in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('session_registrations')
    .upsert(
      {
        session_id: sessionId,
        league_id: leagueId,
        organization_id: reg.organization_id,
        user_id: reg.user_id,
        status: 'registered',
        is_walk_in: true,
        checked_in_at: now,
        checked_in_by: user.id,
      },
      { onConflict: 'session_id,user_id' },
    )

  if (error) return { error: error.message, playerName }

  revalidatePath(`/admin/events/${leagueId}/checkin`)
  return { error: null, playerName }
}

// Admin manually checks in a player from the roster list (session mode).
export async function manualSessionCheckIn(
  sessionRegistrationId: string,
  leagueId: string,
): Promise<{ error: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('session_registrations')
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
    .eq('id', sessionRegistrationId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/checkin`)
  return { error: null }
}

// Admin undoes a session check-in.
export async function undoSessionCheckIn(
  sessionRegistrationId: string,
  leagueId: string,
): Promise<{ error: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('session_registrations')
    .update({ checked_in_at: null, checked_in_by: null })
    .eq('id', sessionRegistrationId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/checkin`)
  return { error: null }
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

// Admin resets an event-level check-in (correction)
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
