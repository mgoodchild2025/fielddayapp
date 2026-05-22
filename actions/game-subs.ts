'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { formatGameTime } from '@/lib/format-time'
import { sendEmail, buildGameSubInviteEmail } from '@/lib/email'

// ── Types ────────────────────────────────────────────────────────────────────

export type GameSub = {
  id: string
  gameId: string
  teamId: string
  userId: string | null
  invitedEmail: string
  status: 'invited' | 'confirmed' | 'declined'
  inviterName: string | null
  message: string | null
  expiresAt: string
  createdAt: string
}

export type GameSubInviteDetails = {
  id: string
  gameId: string
  teamId: string
  teamName: string
  teamColor: string | null
  teamLogoUrl: string | null
  opponentName: string | null
  leagueName: string | null
  leagueSlug: string | null
  leagueId: string | null
  scheduledAt: string
  court: string | null
  inviterName: string | null
  message: string | null
  status: 'invited' | 'confirmed' | 'declined'
  expiresAt: string
  invitedEmail: string
}

// ── Invite a game sub ────────────────────────────────────────────────────────

export async function inviteGameSub(
  gameId: string,
  teamId: string,
  email: string,
  message?: string,
): Promise<{ error: string | null; subId?: string }> {
  if (!gameId || !teamId || !email) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is captain/coach of the team or an org admin
  const [{ data: teamMember }, { data: orgMember }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members').select('role')
      .eq('team_id', teamId).eq('user_id', user.id)
      .eq('organization_id', org.id).eq('status', 'active').maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members').select('role')
      .eq('organization_id', org.id).eq('user_id', user.id).maybeSingle(),
  ])

  const isCaptain  = teamMember && ['captain', 'coach'].includes(teamMember.role)
  const isOrgAdmin = orgMember  && ['org_admin', 'league_admin'].includes(orgMember.role)
  if (!isCaptain && !isOrgAdmin) return { error: 'Not authorized' }

  const normalizedEmail = email.toLowerCase().trim()

  // Fetch game + team + inviter info in parallel
  const [gameRes, inviterRes, brandingRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('games').select(`
      id, scheduled_at, court,
      home_team:teams!games_home_team_id_fkey(id, name),
      away_team:teams!games_away_team_id_fkey(id, name),
      league:leagues!games_league_id_fkey(id, name, slug)
    `).eq('id', gameId).eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles').select('full_name').eq('id', user.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).single(),
  ])

  const game = gameRes.data
  if (!game) return { error: 'Game not found' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeTeam = Array.isArray(game.home_team) ? game.home_team[0] : game.home_team as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayTeam = Array.isArray(game.away_team) ? game.away_team[0] : game.away_team as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league   = Array.isArray(game.league)    ? game.league[0]    : game.league as any

  const isHomeTeam  = homeTeam?.id === teamId
  const teamName    = isHomeTeam ? (homeTeam?.name ?? 'Team') : (awayTeam?.name ?? 'Team')
  const opponentName = isHomeTeam ? (awayTeam?.name ?? null) : (homeTeam?.name ?? null)

  const timezone = brandingRes.data?.timezone ?? 'America/Toronto'
  const { date: gameDate, time: gameTime } = formatGameTime(game.scheduled_at, timezone)
  const inviterName = inviterRes.data?.full_name ?? 'A captain'

  // Delete any stale 'invited' row for this email+game+team before inserting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('game_subs')
    .delete()
    .eq('game_id', gameId)
    .eq('team_id', teamId)
    .ilike('invited_email', normalizedEmail)
    .eq('status', 'invited')

  // Create the invite row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub, error: insertError } = await (db as any)
    .from('game_subs')
    .insert({
      organization_id: org.id,
      game_id: gameId,
      team_id: teamId,
      invited_by: user.id,
      invited_email: normalizedEmail,
      message: message?.trim() || null,
    })
    .select('id, token')
    .single()

  if (insertError) return { error: insertError.message }

  // In-app notification if the invitee already has an account
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inviteeProfile } = await (db as any)
    .from('profiles').select('id').eq('email', normalizedEmail).maybeSingle()

  if (inviteeProfile?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('notifications').insert({
      organization_id: org.id,
      user_id: inviteeProfile.id,
      type: 'sub_invited',
      title: `You've been invited to sub for ${teamName}`,
      body: `${inviterName} needs a sub for ${gameDate} at ${gameTime}.`,
      data: { token: sub.token, gameId, teamId },
    })
  }

  // Build accept URL
  const host   = headersList.get('host') ?? ''
  const proto  = headersList.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const acceptUrl = `${origin}/sub-invite/${sub.token}`

  await sendEmail({
    to: normalizedEmail,
    subject: `Sub invite: ${teamName} on ${gameDate}`,
    html: buildGameSubInviteEmail({
      teamName,
      opponentName,
      leagueName: league?.name ?? null,
      orgName: org.name,
      invitedBy: inviterName,
      gameDate,
      gameTime,
      court: game.court ?? null,
      message: message?.trim() || null,
      acceptUrl,
    }),
  })

  revalidatePath(`/games/${gameId}`)
  revalidatePath('/schedule')
  return { error: null, subId: sub.id }
}

// ── Fetch invite details (by token) ─────────────────────────────────────────

export async function getGameSubInviteDetails(
  token: string,
): Promise<GameSubInviteDetails | null> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('game_subs')
    .select(`
      id, game_id, team_id, invited_email, status, message, expires_at, invited_by,
      game:games!game_subs_game_id_fkey(
        id, scheduled_at, court, league_id,
        home_team:teams!games_home_team_id_fkey(id, name),
        away_team:teams!games_away_team_id_fkey(id, name),
        league:leagues!games_league_id_fkey(id, name, slug)
      ),
      team:teams!game_subs_team_id_fkey(id, name, color, logo_url),
      inviter:profiles!game_subs_invited_by_fkey(full_name)
    `)
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const game     = Array.isArray(data.game)    ? data.game[0]    : data.game as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team     = Array.isArray(data.team)    ? data.team[0]    : data.team as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inviter  = Array.isArray(data.inviter) ? data.inviter[0] : data.inviter as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeTeam = game ? (Array.isArray(game.home_team) ? game.home_team[0] : game.home_team as any) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayTeam = game ? (Array.isArray(game.away_team) ? game.away_team[0] : game.away_team as any) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league   = game ? (Array.isArray(game.league)    ? game.league[0]    : game.league as any)    : null

  const isHomeTeam   = homeTeam?.id === data.team_id
  const opponentName = isHomeTeam ? (awayTeam?.name ?? null) : (homeTeam?.name ?? null)

  return {
    id:           data.id,
    gameId:       data.game_id,
    teamId:       data.team_id,
    teamName:     team?.name ?? 'Unknown Team',
    teamColor:    team?.color ?? null,
    teamLogoUrl:  team?.logo_url ?? null,
    opponentName,
    leagueName:   league?.name   ?? null,
    leagueSlug:   league?.slug   ?? null,
    leagueId:     league?.id     ?? game?.league_id ?? null,
    scheduledAt:  game?.scheduled_at ?? '',
    court:        game?.court    ?? null,
    inviterName:  inviter?.full_name ?? null,
    message:      data.message   ?? null,
    status:       data.status    as 'invited' | 'confirmed' | 'declined',
    expiresAt:    data.expires_at,
    invitedEmail: data.invited_email,
  }
}

// ── Fetch active game subs for a game (for attendance panel) ─────────────────

export async function getGameSubsForGame(
  gameId: string,
): Promise<{ subs: GameSub[]; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { subs: [], error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('game_subs')
    .select(`
      id, game_id, team_id, user_id, invited_email, status, message, expires_at, created_at,
      inviter:profiles!game_subs_invited_by_fkey(full_name)
    `)
    .eq('game_id', gameId)
    .eq('organization_id', org.id)
    .in('status', ['invited', 'confirmed'])
    .order('created_at', { ascending: true })

  if (error) return { subs: [], error: error.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs: GameSub[] = (data ?? []).map((row: any) => {
    const inviter = Array.isArray(row.inviter) ? row.inviter[0] : row.inviter
    return {
      id:           row.id,
      gameId:       row.game_id,
      teamId:       row.team_id,
      userId:       row.user_id ?? null,
      invitedEmail: row.invited_email,
      status:       row.status,
      inviterName:  inviter?.full_name ?? null,
      message:      row.message ?? null,
      expiresAt:    row.expires_at,
      createdAt:    row.created_at,
    }
  })

  return { subs, error: null }
}

// ── Confirm a game sub invite ────────────────────────────────────────────────

export async function confirmGameSub(
  token: string,
  waiverSignatureId?: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch the invite
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (db as any)
    .from('game_subs')
    .select('id, game_id, team_id, invited_email, status, expires_at, invited_by')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!sub) return { error: 'Invite not found' }
  if (sub.status === 'confirmed') return { error: null } // idempotent
  if (sub.status === 'declined') return { error: 'This invite has been declined' }
  if (new Date(sub.expires_at) < new Date()) return { error: 'This invite has expired' }

  // Verify email matches
  const { data: profile } = await db.from('profiles').select('email, full_name').eq('id', user.id).single()
  if (profile?.email?.toLowerCase() !== sub.invited_email.toLowerCase()) {
    return { error: `This invite was sent to ${sub.invited_email} — please sign in with that account` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (db as any)
    .from('game_subs')
    .update({
      status: 'confirmed',
      user_id: user.id,
      waiver_signature_id: waiverSignatureId ?? null,
    })
    .eq('id', sub.id)

  if (updateErr) return { error: updateErr.message }

  // Ensure org membership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('org_members').upsert({
    organization_id: org.id,
    user_id: user.id,
    role: 'player',
    status: 'active',
  }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })

  // Add game_rsvps 'in' entry so they show in the attendance count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('game_rsvps').upsert({
    organization_id: org.id,
    game_id: sub.game_id,
    user_id: user.id,
    team_id: sub.team_id,
    status: 'in',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'game_id,user_id' })

  // Notify the captain
  const playerName = profile?.full_name ?? sub.invited_email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('notifications').insert({
    organization_id: org.id,
    user_id: sub.invited_by,
    type: 'sub_confirmed',
    title: `${playerName} confirmed as sub`,
    body: `They\'re in for your game.`,
    data: { gameId: sub.game_id, teamId: sub.team_id },
  })

  revalidatePath(`/games/${sub.game_id}`)
  revalidatePath('/schedule')
  return { error: null }
}

// ── Decline a game sub invite ────────────────────────────────────────────────

export async function declineGameSub(
  token: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (db as any)
    .from('game_subs')
    .select('id, game_id, team_id, invited_email, status, invited_by')
    .eq('token', token)
    .eq('organization_id', org.id)
    .single()

  if (!sub) return { error: 'Invite not found' }
  if (sub.status !== 'invited') return { error: null } // already actioned

  // Verify email
  const { data: profile } = await db.from('profiles').select('email, full_name').eq('id', user.id).single()
  if (profile?.email?.toLowerCase() !== sub.invited_email.toLowerCase()) {
    return { error: 'Email mismatch' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('game_subs').update({ status: 'declined' }).eq('id', sub.id)

  // Notify captain
  const playerName = profile?.full_name ?? sub.invited_email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('notifications').insert({
    organization_id: org.id,
    user_id: sub.invited_by,
    type: 'sub_declined',
    title: `${playerName} can't make it`,
    body: `They declined your sub invite for this game.`,
    data: { gameId: sub.game_id, teamId: sub.team_id },
  })

  revalidatePath(`/games/${sub.game_id}`)
  revalidatePath('/schedule')
  return { error: null }
}

// ── Remove a game sub (captain action) ───────────────────────────────────────

export async function removeGameSub(
  gameSubId: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch the row so we can verify auth and get game/team ids
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (db as any)
    .from('game_subs')
    .select('id, game_id, team_id, user_id, status')
    .eq('id', gameSubId)
    .eq('organization_id', org.id)
    .single()

  if (!sub) return { error: 'Not found' }

  // Auth: captain/coach of that team or org admin
  const [{ data: tm }, { data: om }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members').select('role')
      .eq('team_id', sub.team_id).eq('user_id', user.id)
      .eq('organization_id', org.id).eq('status', 'active').maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members').select('role')
      .eq('organization_id', org.id).eq('user_id', user.id).maybeSingle(),
  ])

  const isCaptain  = tm && ['captain', 'coach'].includes(tm.role)
  const isOrgAdmin = om && ['org_admin', 'league_admin'].includes(om.role)
  if (!isCaptain && !isOrgAdmin) return { error: 'Not authorized' }

  // Remove the game_subs row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('game_subs').delete().eq('id', gameSubId)

  // If confirmed, also remove the game_rsvp entry
  if (sub.status === 'confirmed' && sub.user_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('game_rsvps')
      .delete()
      .eq('game_id', sub.game_id)
      .eq('user_id', sub.user_id)
      .eq('team_id', sub.team_id)
  }

  revalidatePath(`/games/${sub.game_id}`)
  revalidatePath('/schedule')
  return { error: null }
}
