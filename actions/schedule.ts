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
  const { data, error } = await supabase
    .from('games')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      home_team_id: parsed.data.homeTeamId ?? null,
      away_team_id: parsed.data.awayTeamId ?? null,
      scheduled_at: parsed.data.scheduledAt,
      court: parsed.data.court ?? null,
      week_number: parsed.data.weekNumber ?? null,
      division_id: parsed.data.divisionId ?? null,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  revalidatePath(`/admin/leagues/${parsed.data.leagueId}/schedule`)
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
}) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('league_id', input.leagueId)
    .eq('organization_id', org.id)
    .eq('status', 'active')

  if (!teams || teams.length < 2) return { error: 'Need at least 2 active teams to generate a schedule', count: 0 }

  const { generateRoundRobin, assignDates } = await import('@/lib/scheduler')
  const fixtures = generateRoundRobin(teams)
  const scheduled = assignDates(fixtures, {
    startDate: input.startDate,
    gameTime: input.gameTime,
    daysBetweenRounds: input.daysBetweenRounds,
    courts: input.courts,
  })

  const games = scheduled.map(g => ({
    organization_id: org.id,
    league_id: input.leagueId,
    home_team_id: g.homeTeamId,
    away_team_id: g.awayTeamId,
    scheduled_at: g.scheduledAt,
    week_number: g.weekNumber,
    court: g.court,
  }))

  const { error } = await supabase.from('games').insert(games)
  if (error) return { error: error.message, count: 0 }

  revalidatePath(`/admin/leagues/${input.leagueId}/schedule`)
  return { error: null, count: games.length }
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

  revalidatePath(`/admin/leagues/${leagueId}/schedule`)
  return { data: { count: games.length }, error: null }
}
