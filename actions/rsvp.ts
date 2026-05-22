'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { sendSms } from '@/lib/twilio'
import { formatGameTime } from '@/lib/format-time'

/**
 * Upsert the current user's RSVP for a game.
 * teamId must be the team the user belongs to in this game.
 * When status is 'out', sends a system notification + SMS to the team captain
 * and a system notification to all org admins.
 */
export async function upsertRsvp(gameId: string, teamId: string, status: 'in' | 'out') {
  if (!gameId || !teamId || (status !== 'in' && status !== 'out')) {
    return { error: 'Invalid input' }
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('game_rsvps')
    .upsert(
      {
        organization_id: org.id,
        game_id: gameId,
        user_id: user.id,
        team_id: teamId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'game_id,user_id' }
    )

  if (error) return { error: error.message }

  // ── Out-RSVP notifications ─────────────────────────────────────────────────
  // Fire-and-forget: notify team captain + org admins when a player RSVPs out.
  if (status === 'out') {
    notifyRsvpOut({ orgId: org.id, orgName: org.name, gameId, teamId, userId: user.id, db }).catch(() => {})
  }

  revalidatePath('/events/[slug]', 'page')
  revalidatePath('/schedule')
  return { error: null }
}

/** Sends system notifications (and captain SMS) when a player RSVPs out. */
async function notifyRsvpOut({
  orgId, orgName, gameId, teamId, userId, db,
}: {
  orgId: string
  orgName: string
  gameId: string
  teamId: string
  userId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
}) {
  // Fetch game, player profile, team captains, and org admins in parallel
  const [gameRes, profileRes, captainRes, adminRes, brandingRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('games').select(`
      id, scheduled_at, court,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      leagues(name)
    `).eq('id', gameId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('full_name').eq('id', userId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members')
      .select('user_id, profiles!team_members_user_id_fkey(full_name, phone, sms_opted_in)')
      .eq('team_id', teamId)
      .eq('role', 'captain')
      .eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('role', ['org_admin', 'league_admin'])
      .eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', orgId).single(),
  ])

  const game = gameRes.data
  if (!game) return

  const playerName: string = profileRes.data?.full_name ?? 'A player'
  const timezone: string = brandingRes.data?.timezone ?? 'America/Toronto'

  const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
  const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
  const league   = Array.isArray(game.leagues)   ? game.leagues[0]   : game.leagues
  const teamName = homeTeam?.id === teamId ? homeTeam?.name : awayTeam?.name
  const opponent = homeTeam?.id === teamId ? awayTeam?.name : homeTeam?.name
  const { date: gameDate, time: gameTime } = formatGameTime(game.scheduled_at, timezone)
  const venueStr = game.court ? ` · ${game.court}` : ''

  const notifTitle = `${playerName} is out`
  const notifBody  = `${playerName} has RSVP'd out for ${teamName}${opponent ? ` vs ${opponent}` : ''} on ${gameDate} at ${gameTime}${venueStr}.`

  // Collect unique user IDs to notify (captains + admins, excluding the player themselves)
  const captains = (captainRes.data ?? []) as {
    user_id: string
    profiles: { full_name?: string; phone?: string; sms_opted_in?: boolean } | { full_name?: string; phone?: string; sms_opted_in?: boolean }[] | null
  }[]
  const adminUserIds: string[] = (adminRes.data ?? []).map((a: { user_id: string }) => a.user_id)

  const notifyUserIds = [
    ...captains.map((c) => c.user_id),
    ...adminUserIds,
  ].filter((id, i, arr) => id !== userId && arr.indexOf(id) === i) // deduplicate, exclude self

  if (notifyUserIds.length > 0) {
    await db.from('notifications').insert(
      notifyUserIds.map((uid: string) => ({
        organization_id: orgId,
        user_id: uid,
        type: 'rsvp_out',
        title: notifTitle,
        body: notifBody,
        data: { gameId, teamId, playerId: userId },
      }))
    )
  }

  // SMS to team captain(s) who have opted in
  const smsBody = `${orgName}\n\n${notifBody}\n\nReply STOP to unsubscribe.`

  for (const captain of captains) {
    if (captain.user_id === userId) continue // skip if captain RSVPd themselves
    const profile = Array.isArray(captain.profiles) ? captain.profiles[0] : captain.profiles
    if (!profile?.phone || !profile?.sms_opted_in) continue
    sendSms(profile.phone, smsBody).catch(() => {})
  }
}

export type AttendancePlayer = {
  userId: string
  name: string
  role: string
  rsvp: 'in' | 'out' | null
}

/**
 * Fetch the full roster + RSVP status for a game.
 * Caller must be a captain of the given team.
 */
export async function getGameAttendanceDetails(gameId: string, teamId: string): Promise<{
  players: AttendancePlayer[]
  error: string | null
}> {
  if (!gameId || !teamId) return { players: [], error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { players: [], error: 'Not authenticated' }

  const db = createServiceRoleClient()

  // Verify caller is an active captain of this team
  const { data: captainship } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('role', 'captain')
    .eq('status', 'active')
    .single()
  if (!captainship) return { players: [], error: 'Not authorized' }

  // Fetch all active roster members + all RSVPs for this game in parallel
  const [{ data: members }, { data: rsvps }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('team_members')
      .select('user_id, role, profile:profiles!team_members_user_id_fkey(full_name)')
      .eq('team_id', teamId)
      .eq('organization_id', org.id)
      .eq('status', 'active'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('game_rsvps')
      .select('user_id, status')
      .eq('game_id', gameId)
      .eq('team_id', teamId),
  ])

  const rsvpMap = new Map<string, 'in' | 'out'>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rsvps ?? []) as any[]) rsvpMap.set(r.user_id, r.status as 'in' | 'out')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players: AttendancePlayer[] = ((members ?? []) as any[]).map((m) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    return {
      userId: m.user_id as string,
      name: (profile?.full_name ?? 'Unknown') as string,
      role: m.role as string,
      rsvp: rsvpMap.get(m.user_id) ?? null,
    }
  })

  // Sort: in first, then out, then no-response; alphabetical within each group
  players.sort((a, b) => {
    const order = { in: 0, out: 1 }
    const aO = a.rsvp !== null ? (order[a.rsvp as keyof typeof order] ?? 2) : 2
    const bO = b.rsvp !== null ? (order[b.rsvp as keyof typeof order] ?? 2) : 2
    if (aO !== bO) return aO - bO
    return a.name.localeCompare(b.name)
  })

  return { players, error: null }
}
