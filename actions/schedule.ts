'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { parseLocalToUtc, formatGameTime } from '@/lib/format-time'
import { getResend, FROM_EMAIL } from '@/lib/resend'

// ── Notification helpers ────────────────────────────────────────────────────

/** Fetch active team members with profile data for both teams of a game. */
async function getGameParticipants(orgId: string, homeTeamId: string | null, awayTeamId: string | null) {
  const teamIds = [homeTeamId, awayTeamId].filter(Boolean) as string[]
  if (!teamIds.length) return []
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from('team_members')
    .select('user_id, profile:profiles!team_members_user_id_fkey(full_name, email)')
    .in('team_id', teamIds)
    .eq('status', 'active')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((m: { user_id: string; profile: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null }) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
    return { userId: m.user_id as string, email: profile?.email as string | undefined, name: profile?.full_name as string | undefined }
  }).filter((m: { userId: string }) => !!m.userId)
}

/** Insert in-app notifications and optionally send emails to all participants. */
async function notifyGameStatusChange(opts: {
  orgId: string
  gameId: string
  homeTeamId: string | null
  awayTeamId: string | null
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
  sendEmails: boolean
  emailSubject: string
  emailHtml: string
}) {
  const participants = await getGameParticipants(opts.orgId, opts.homeTeamId, opts.awayTeamId)
  if (!participants.length) return

  const db = createServiceRoleClient()
  await db.from('notifications').insert(
    participants.map((p: { userId: string; email?: string; name?: string }) => ({
      organization_id: opts.orgId,
      user_id: p.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      data: { gameId: opts.gameId, ...(opts.data ?? {}) },
    }))
  )

  if (opts.sendEmails) {
    const resend = getResend()
    await Promise.allSettled(
      participants
        .filter((p: { userId: string; email?: string }) => !!p.email)
        .map((p: { userId: string; email?: string }) =>
          resend.emails.send({
            from: FROM_EMAIL,
            to: p.email!,
            subject: opts.emailSubject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">${opts.emailHtml}</div>`,
          })
        )
    )
  }
}

const addGameSchema = z.object({
  leagueId: z.string().uuid(),
  homeTeamId: z.string().uuid().optional(),
  awayTeamId: z.string().uuid().optional(),
  homeTeamLabel: z.string().optional(),
  awayTeamLabel: z.string().optional(),
  scheduledAt: z.string(),
  court: z.string().optional(),
  weekNumber: z.coerce.number().optional(),
  divisionId: z.string().uuid().optional(),
})

export async function addGame(input: z.infer<typeof addGameSchema>) {
  const parsed = addGameSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('games')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      home_team_id: parsed.data.homeTeamId ?? null,
      away_team_id: parsed.data.awayTeamId ?? null,
      home_team_label: parsed.data.homeTeamLabel ?? null,
      away_team_label: parsed.data.awayTeamLabel ?? null,
      scheduled_at: parsed.data.scheduledAt,
      court: parsed.data.court ?? null,
      week_number: parsed.data.weekNumber ?? null,
      division_id: parsed.data.divisionId ?? null,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  revalidatePath(`/admin/events/${parsed.data.leagueId}/schedule`)
  return { data, error: null }
}

export type CsvGameRow = {
  date: string
  time: string
  home_team: string
  away_team: string
  court?: string
  week?: string
}

export async function generateRoundRobinSchedule(input: {
  leagueId: string
  // ── Weekly mode ───────────────────────────────────────────────────────────
  startDate?: string
  gameTime?: string
  daysBetweenRounds?: number
  courts?: number
  // ── Day-schedule mode ─────────────────────────────────────────────────────
  daySchedule?: {
    startDate: string          // YYYY-MM-DD
    startTime: string          // HH:MM
    gameDurationMinutes: number
    breakBetweenSlotsMinutes: number
    courtsAvailable: number
    specialBreaks: Array<{ label: string; startTime: string; durationMinutes: number }>
  }
  /** Template mode: generate placeholder slots when no teams are registered yet */
  expectedTeamCount?: number
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: realTeams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('league_id', input.leagueId)
    .eq('organization_id', org.id)
    .eq('status', 'active')

  const { generateRoundRobin, assignDates, assignTimeSlots } = await import('@/lib/scheduler')

  // Template mode: no real teams — generate positional placeholder slots
  const useSlotMode = (!realTeams || realTeams.length < 2) && !!(input.expectedTeamCount && input.expectedTeamCount >= 2)
  if (!useSlotMode && (!realTeams || realTeams.length < 2)) {
    return { error: 'Need at least 2 active teams, or enter an expected team count to generate a template.', count: 0 }
  }

  const teams = useSlotMode
    ? Array.from({ length: input.expectedTeamCount! }, (_, i) => ({ id: `slot_${i + 1}`, name: `Team ${i + 1}` }))
    : realTeams!

  const fixtures = generateRoundRobin(teams)

  let scheduled
  if (input.daySchedule) {
    const ds = input.daySchedule
    scheduled = assignTimeSlots(fixtures, {
      startDateTime: `${ds.startDate}T${ds.startTime}`,
      gameDurationMinutes: ds.gameDurationMinutes,
      breakBetweenSlotsMinutes: ds.breakBetweenSlotsMinutes,
      courtsAvailable: ds.courtsAvailable,
      specialBreaks: ds.specialBreaks,
      slotMode: useSlotMode,
    })
  } else {
    scheduled = assignDates(fixtures, {
      startDate: input.startDate!,
      gameTime: input.gameTime!,
      daysBetweenRounds: input.daysBetweenRounds!,
      courts: input.courts ?? 1,
      slotMode: useSlotMode,
    })
  }

  const games = scheduled.map(g => ({
    organization_id: org.id,
    league_id: input.leagueId,
    home_team_id: g.homeTeamId,
    away_team_id: g.awayTeamId,
    home_team_label: g.homeTeamLabel ?? null,
    away_team_label: g.awayTeamLabel ?? null,
    scheduled_at: g.scheduledAt,
    week_number: g.weekNumber,
    court: g.court,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('games').insert(games)
  if (error) return { error: error.message, count: 0 }

  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  return { error: null, count: games.length, isTemplate: useSlotMode }
}

const updateGameSchema = z.object({
  gameId: z.string().uuid(),
  leagueId: z.string().uuid(),
  homeTeamId: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  awayTeamId: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  homeTeamLabel: z.string().optional(),
  awayTeamLabel: z.string().optional(),
  scheduledAt: z.string().min(1),
  court: z.string().optional(),
  weekNumber: z.coerce.number().optional(),
})

export async function updateGame(input: z.infer<typeof updateGameSchema>) {
  const parsed = updateGameSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!adminMember) return { error: 'Admin access required' }

  // When assigning a real team, clear the label for that slot
  const homeLabel = parsed.data.homeTeamId ? null : (parsed.data.homeTeamLabel ?? null)
  const awayLabel = parsed.data.awayTeamId ? null : (parsed.data.awayTeamLabel ?? null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('games')
    .update({
      home_team_id: parsed.data.homeTeamId ?? null,
      away_team_id: parsed.data.awayTeamId ?? null,
      home_team_label: homeLabel,
      away_team_label: awayLabel,
      scheduled_at: parsed.data.scheduledAt,
      court: parsed.data.court ?? null,
      week_number: parsed.data.weekNumber ?? null,
    })
    .eq('id', parsed.data.gameId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${parsed.data.leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function deleteGame(gameId: string, leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!adminMember) return { error: 'Admin access required' }

  const { error } = await supabase
    .from('games')
    .delete()
    .eq('id', gameId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath(`/admin/events/${leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function assignSlotToTeam(input: {
  leagueId: string
  /** Each entry maps a slot label (e.g. "Team 3") to a real team id */
  assignments: Array<{ slotLabel: string; teamId: string }>
}) {
  if (!input.leagueId || !input.assignments.length) {
    return { error: 'Invalid input', count: 0 }
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', count: 0 }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()
  if (!adminMember) return { error: 'Admin access required', count: 0 }

  // Apply each assignment — update both home and away slots in parallel
  const updates = input.assignments.flatMap(({ slotLabel, teamId }) => [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('games')
      .update({ home_team_id: teamId, home_team_label: null })
      .eq('league_id', input.leagueId)
      .eq('organization_id', org.id)
      .is('home_team_id', null)
      .eq('home_team_label', slotLabel),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('games')
      .update({ away_team_id: teamId, away_team_label: null })
      .eq('league_id', input.leagueId)
      .eq('organization_id', org.id)
      .is('away_team_id', null)
      .eq('away_team_label', slotLabel),
  ])

  const results = await Promise.all(updates)
  const firstError = results.find(r => r.error)
  if (firstError?.error) return { error: firstError.error.message, count: 0 }

  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  return { error: null, count: input.assignments.length }
}

export async function insertBreak(input: {
  leagueId: string
  /** UTC ISO string — games with scheduled_at >= this value get shifted forward */
  breakAt: string
  durationMinutes: number
}) {
  if (!input.leagueId || !input.breakAt || input.durationMinutes <= 0) {
    return { error: 'Invalid input', count: 0 }
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', count: 0 }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()
  if (!adminMember) return { error: 'Admin access required', count: 0 }

  // Fetch all games at-or-after the break point
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gamesAfter, error: fetchError } = await (supabase as any)
    .from('games')
    .select('id, scheduled_at')
    .eq('league_id', input.leagueId)
    .eq('organization_id', org.id)
    .gte('scheduled_at', input.breakAt)
    .order('scheduled_at', { ascending: true })

  if (fetchError) return { error: fetchError.message, count: 0 }
  if (!gamesAfter || gamesAfter.length === 0) return { error: null, count: 0 }

  // Shift each game forward by durationMinutes
  const shiftMs = input.durationMinutes * 60 * 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates = (gamesAfter as any[]).map((g: any) =>
    (supabase as any)
      .from('games')
      .update({ scheduled_at: new Date(new Date(g.scheduled_at).getTime() + shiftMs).toISOString() })
      .eq('id', g.id)
      .eq('organization_id', org.id)
  )

  const results = await Promise.all(updates)
  const firstError = results.find(r => r.error)
  if (firstError?.error) return { error: firstError.error.message, count: 0 }

  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null, count: gamesAfter.length }
}

// ── Game status actions ─────────────────────────────────────────────────────

/** Shared admin auth check + game fetch. Returns org, game data, or error. */
async function getGameForStatusChange(gameId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { org: null, supabase: null, game: null, error: 'Not authenticated' as string }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()
  if (!adminMember) return { org: null, supabase: null, game: null, error: 'Admin access required' as string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: game, error: gameError } = await (supabase as any)
    .from('games')
    .select(`
      home_team_id, away_team_id, scheduled_at,
      home_team:teams!games_home_team_id_fkey(name),
      away_team:teams!games_away_team_id_fkey(name),
      league:leagues!games_league_id_fkey(name, sport)
    `)
    .eq('id', gameId)
    .eq('organization_id', org.id)
    .single()

  if (gameError || !game) return { org: null, supabase: null, game: null, error: 'Game not found' as string }
  return { org, supabase, game, error: null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveGameNames(game: any) {
  const homeName: string = (Array.isArray(game.home_team) ? game.home_team[0] : game.home_team)?.name ?? 'TBD'
  const awayName: string = (Array.isArray(game.away_team) ? game.away_team[0] : game.away_team)?.name ?? 'TBD'
  const leagueRaw = Array.isArray(game.league) ? game.league[0] : game.league
  const leagueName: string = leagueRaw?.name ?? ''
  return { homeName, awayName, leagueName }
}

export async function cancelGame(input: {
  gameId: string
  leagueId: string
  reason?: string
  notify: boolean
}) {
  const { org, supabase, game, error: authError } = await getGameForStatusChange(input.gameId)
  if (authError || !org || !supabase || !game) return { error: authError ?? 'Unknown error' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('games')
    .update({ status: 'cancelled', cancellation_reason: input.reason ?? null })
    .eq('id', input.gameId)
    .eq('organization_id', org.id)
  if (error) return { error: error.message }

  if (input.notify && (game.home_team_id || game.away_team_id)) {
    const { data: branding } = await supabase
      .from('org_branding')
      .select('timezone')
      .eq('organization_id', org.id)
      .single()
    const timezone = branding?.timezone ?? 'America/Toronto'
    const { homeName, awayName, leagueName } = resolveGameNames(game)
    const { time: timeLabel, date: dateLabel } = formatGameTime(game.scheduled_at, timezone)
    const reasonSuffix = input.reason ? ` Reason: ${input.reason}` : ''
    await notifyGameStatusChange({
      orgId: org.id,
      gameId: input.gameId,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      type: 'game_cancelled',
      title: 'Game Cancelled',
      body: `${homeName} vs ${awayName} on ${dateLabel} at ${timeLabel} has been cancelled.${reasonSuffix}`,
      sendEmails: true,
      emailSubject: `Game Cancelled – ${homeName} vs ${awayName}`,
      emailHtml: `
        <h2 style="margin:0 0 8px;font-size:22px;">Game Cancelled</h2>
        <p style="color:#374151;margin:0 0 16px;">
          Your game <strong>${homeName} vs ${awayName}</strong> scheduled for
          <strong>${dateLabel} at ${timeLabel}</strong>${leagueName ? ` (${leagueName})` : ''} has been <strong>cancelled</strong>.
        </p>
        ${input.reason ? `<p style="color:#6b7280;font-style:italic;margin:0;">${input.reason}</p>` : ''}
      `,
    })
  }

  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function postponeGame(input: {
  gameId: string
  leagueId: string
  reason?: string
  notify: boolean
}) {
  const { org, supabase, game, error: authError } = await getGameForStatusChange(input.gameId)
  if (authError || !org || !supabase || !game) return { error: authError ?? 'Unknown error' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('games')
    .update({ status: 'postponed', cancellation_reason: input.reason ?? null })
    .eq('id', input.gameId)
    .eq('organization_id', org.id)
  if (error) return { error: error.message }

  if (input.notify && (game.home_team_id || game.away_team_id)) {
    const { data: branding } = await supabase
      .from('org_branding')
      .select('timezone')
      .eq('organization_id', org.id)
      .single()
    const timezone = branding?.timezone ?? 'America/Toronto'
    const { homeName, awayName, leagueName } = resolveGameNames(game)
    const { time: timeLabel, date: dateLabel } = formatGameTime(game.scheduled_at, timezone)
    const reasonSuffix = input.reason ? ` Reason: ${input.reason}` : ''
    await notifyGameStatusChange({
      orgId: org.id,
      gameId: input.gameId,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      type: 'game_postponed',
      title: 'Game Postponed',
      body: `${homeName} vs ${awayName} on ${dateLabel} at ${timeLabel} has been postponed.${reasonSuffix}`,
      sendEmails: true,
      emailSubject: `Game Postponed – ${homeName} vs ${awayName}`,
      emailHtml: `
        <h2 style="margin:0 0 8px;font-size:22px;">Game Postponed</h2>
        <p style="color:#374151;margin:0 0 16px;">
          Your game <strong>${homeName} vs ${awayName}</strong> scheduled for
          <strong>${dateLabel} at ${timeLabel}</strong>${leagueName ? ` (${leagueName})` : ''} has been <strong>postponed</strong>.
          A new date will be announced soon.
        </p>
        ${input.reason ? `<p style="color:#6b7280;font-style:italic;margin:0;">${input.reason}</p>` : ''}
      `,
    })
  }

  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function restoreGame(input: {
  gameId: string
  leagueId: string
  notify: boolean
}) {
  const { org, supabase, game, error: authError } = await getGameForStatusChange(input.gameId)
  if (authError || !org || !supabase || !game) return { error: authError ?? 'Unknown error' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('games')
    .update({ status: 'scheduled', cancellation_reason: null })
    .eq('id', input.gameId)
    .eq('organization_id', org.id)
  if (error) return { error: error.message }

  if (input.notify && (game.home_team_id || game.away_team_id)) {
    const { data: branding } = await supabase
      .from('org_branding')
      .select('timezone')
      .eq('organization_id', org.id)
      .single()
    const timezone = branding?.timezone ?? 'America/Toronto'
    const { homeName, awayName, leagueName } = resolveGameNames(game)
    const { time: timeLabel, date: dateLabel } = formatGameTime(game.scheduled_at, timezone)
    await notifyGameStatusChange({
      orgId: org.id,
      gameId: input.gameId,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      type: 'game_restored',
      title: 'Game Rescheduled',
      body: `${homeName} vs ${awayName} is back on! See you ${dateLabel} at ${timeLabel}.`,
      sendEmails: true,
      emailSubject: `Game Back On – ${homeName} vs ${awayName}`,
      emailHtml: `
        <h2 style="margin:0 0 8px;font-size:22px;">Game Back On! 🎉</h2>
        <p style="color:#374151;margin:0;">
          Your game <strong>${homeName} vs ${awayName}</strong>${leagueName ? ` (${leagueName})` : ''} is back on —
          see you <strong>${dateLabel} at ${timeLabel}</strong>.
        </p>
      `,
    })
  }

  revalidatePath(`/admin/events/${input.leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')
  return { error: null }
}

export async function importGamesFromCsv(leagueId: string, rows: CsvGameRow[]) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()

  // Get org timezone for correct UTC conversion
  const { data: branding } = await supabase
    .from('org_branding')
    .select('timezone')
    .eq('organization_id', org.id)
    .single()
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Fetch all teams for this league to match by name
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)

  const teamMap = new Map(teams?.map((t) => [t.name.toLowerCase(), t.id]))

  const games = rows.map((row) => ({
    organization_id: org.id,
    league_id: leagueId,
    scheduled_at: parseLocalToUtc(row.date, row.time, timezone),
    home_team_id: teamMap.get(row.home_team.toLowerCase()) ?? null,
    away_team_id: teamMap.get(row.away_team.toLowerCase()) ?? null,
    court: row.court ?? null,
    week_number: row.week ? parseInt(row.week, 10) : null,
  }))

  const { error } = await supabase.from('games').insert(games)
  if (error) return { data: null, error: error.message }

  revalidatePath(`/admin/events/${leagueId}/schedule`)
  return { data: { count: games.length }, error: null }
}
