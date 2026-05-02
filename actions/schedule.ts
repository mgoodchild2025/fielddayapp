'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { parseLocalToUtc } from '@/lib/format-time'

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
  startDate: string
  gameTime: string
  daysBetweenRounds: number
  courts: number
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

  const { generateRoundRobin, assignDates } = await import('@/lib/scheduler')

  // Template mode: no real teams — generate positional placeholder slots
  const useSlotMode = (!realTeams || realTeams.length < 2) && !!(input.expectedTeamCount && input.expectedTeamCount >= 2)
  if (!useSlotMode && (!realTeams || realTeams.length < 2)) {
    return { error: 'Need at least 2 active teams, or enter an expected team count to generate a template.', count: 0 }
  }

  const teams = useSlotMode
    ? Array.from({ length: input.expectedTeamCount! }, (_, i) => ({ id: `slot_${i + 1}`, name: `Team ${i + 1}` }))
    : realTeams!

  const fixtures = generateRoundRobin(teams)
  const scheduled = assignDates(fixtures, {
    startDate: input.startDate,
    gameTime: input.gameTime,
    daysBetweenRounds: input.daysBetweenRounds,
    courts: input.courts,
    slotMode: useSlotMode,
  })

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
