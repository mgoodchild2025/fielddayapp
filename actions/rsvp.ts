'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { sendSms } from '@/lib/twilio'
import { formatGameTime } from '@/lib/format-time'
import { createNotifications } from '@/lib/notify'
import { pushConfigured } from '@/lib/push'
import { decideReminderChannels } from '@/lib/reminder-channels'
import {
  rsvpAlertFor, rsvpRecipients, activeOrganizerIds, rsvpMessage,
  TEAM_MANAGER_ROLES, type RsvpAlert, type RsvpStatus,
} from '@/lib/rsvp-notify'

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

  // The caller may only RSVP for a team they actually play on, for a game that
  // team is actually in. Without this any signed-in user could write an RSVP
  // against any team — corrupting that team's attendance count and firing a
  // real SMS to its captain.
  const [{ data: game }, { data: membership }, { data: previousRsvp }] = await Promise.all([
    db.from('games')
      .select('home_team_id, away_team_id, league_id')
      .eq('id', gameId)
      .eq('organization_id', org.id)
      .maybeSingle(),
    db.from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    // The previous answer decides whether this is news: a change back to "in"
    // after saying "out" must reach the people who were told they were out.
    db.from('game_rsvps')
      .select('status')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!game) return { error: 'Game not found' }
  if (game.home_team_id !== teamId && game.away_team_id !== teamId) {
    return { error: 'That team is not playing in this game' }
  }
  if (!membership) return { error: 'You are not on that team' }

  const { error } = await db
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

  // ── RSVP change notifications ──────────────────────────────────────────────
  // Fire-and-forget. Only a real change raises an alert — see lib/rsvp-notify.
  const alert = rsvpAlertFor((previousRsvp?.status ?? null) as RsvpStatus | null, status)
  if (alert) {
    notifyRsvpChange({
      orgId: org.id, orgName: org.name, gameId, leagueId: game.league_id as string,
      teamId, userId: user.id, alert, db,
    }).catch(() => {})
  }

  revalidatePath('/events/[slug]', 'page')
  revalidatePath('/schedule')
  return { error: null }
}

/**
 * Tells the right people about an RSVP change.
 *
 * Recipients: the team's managers (captains and coaches) plus the event's
 * organizers, falling back to org admins when the event has none. Managers
 * also get a text, but push-first — the same rule as every reminder, so a
 * manager with phone alerts on is not buzzed twice for one change.
 */
async function notifyRsvpChange({
  orgId, orgName, gameId, leagueId, teamId, userId, alert, db,
}: {
  orgId: string
  orgName: string
  gameId: string
  leagueId: string
  teamId: string
  userId: string
  alert: RsvpAlert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
}) {
  const [gameRes, profileRes, managerRes, organizerRes, adminRes, brandingRes] = await Promise.all([
    db.from('games').select(`
      id, scheduled_at, court,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name)
    `).eq('id', gameId).single(),

    db.from('profiles').select('full_name').eq('id', userId).single(),

    db.from('team_members')
      .select('user_id, profiles!team_members_user_id_fkey(phone, sms_opted_in, push_reminders_enabled, sms_also_when_push)')
      .eq('team_id', teamId)
      .in('role', [...TEAM_MANAGER_ROLES])
      .eq('status', 'active'),

    db.from('league_organizers')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('league_id', leagueId)
      .eq('status', 'active'),

    db.from('org_members')
      .select('user_id, role')
      .eq('organization_id', orgId)
      .in('role', ['org_admin', 'league_admin'])
      .eq('status', 'active'),

    db.from('org_branding').select('timezone').eq('organization_id', orgId).single(),
  ])

  const game = gameRes.data
  if (!game) return

  type ManagerProfile = { phone?: string | null; sms_opted_in?: boolean | null; push_reminders_enabled?: boolean | null; sms_also_when_push?: boolean | null }
  const managers = (managerRes.data ?? []) as { user_id: string; profiles: ManagerProfile | ManagerProfile[] | null }[]
  const admins = (adminRes.data ?? []) as { user_id: string; role: string }[]

  const recipients = rsvpRecipients({
    playerId: userId,
    managerIds: managers.map((m) => m.user_id),
    organizerIds: activeOrganizerIds(
      ((organizerRes.data ?? []) as { user_id: string | null }[]).map((o) => o.user_id),
      new Set(admins.map((a) => a.user_id)),
    ),
    orgAdminIds: admins.filter((a) => a.role === 'org_admin').map((a) => a.user_id),
  })

  const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team
  const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team
  const onHome = homeTeam?.id === teamId
  const { date, time } = formatGameTime(game.scheduled_at, brandingRes.data?.timezone ?? 'America/Toronto')
  const { title, body } = rsvpMessage(alert, {
    playerName: profileRes.data?.full_name ?? 'A player',
    teamName: onHome ? homeTeam?.name : awayTeam?.name,
    opponent: onHome ? awayTeam?.name : homeTeam?.name,
    date, time, court: game.court,
  })

  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((uid) => ({
        organization_id: orgId,
        user_id: uid,
        type: alert === 'out' ? 'rsvp_out' : 'rsvp_in',
        title,
        body,
        data: { gameId, teamId, playerId: userId },
      }))
    )
  }

  // ── Text the managers, push-first ──────────────────────────────────────────
  const textable = managers.filter((m) => m.user_id !== userId)
  if (textable.length === 0) return

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('user_id')
    .eq('organization_id', orgId)
    .in('user_id', textable.map((m) => m.user_id))
  const hasPush = new Set(((subs ?? []) as { user_id: string }[]).map((r) => r.user_id))
  const pushOn = pushConfigured()
  const smsBody = `${orgName}\n\n${body}\n\nReply STOP to unsubscribe.`

  for (const m of textable) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    const channels = decideReminderChannels(
      {
        phone: p?.phone,
        smsOptedIn: p?.sms_opted_in,
        pushRemindersEnabled: p?.push_reminders_enabled,
        smsAlsoWhenPush: p?.sms_also_when_push,
      },
      // RSVP texts have never had an org-level toggle; keep that unchanged.
      { orgSmsEnabled: true, pushConfigured: pushOn, hasPushSubscription: hasPush.has(m.user_id) },
    )
    if (channels.sms && p?.phone) sendSms(p.phone, smsBody).catch(() => {})
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

    db
      .from('team_members')
      .select('user_id, role, profile:profiles!team_members_user_id_fkey(full_name)')
      .eq('team_id', teamId)
      .eq('organization_id', org.id)
      .eq('status', 'active'),

    db
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
