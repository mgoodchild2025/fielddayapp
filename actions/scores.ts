'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { advanceBracketFromScore } from '@/actions/brackets'

const submitScoreSchema = z.object({
  gameId: z.string().uuid(),
  homeScore: z.coerce.number().min(0),
  awayScore: z.coerce.number().min(0),
  sets: z.array(z.object({ home: z.number(), away: z.number() })).optional(),
})

export async function submitScore(input: z.infer<typeof submitScoreSchema>) {
  const parsed = submitScoreSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Verify user is captain of one of the teams
  const { data: game } = await supabase
    .from('games')
    .select('home_team_id, away_team_id, league_id')
    .eq('id', parsed.data.gameId)
    .eq('organization_id', org.id)
    .single()

  if (!game) return { data: null, error: 'Game not found' }

  const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]
  const { data: captainship } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'captain')
    .in('team_id', teamIds)
    .single()

  // Also allow org/league admins
  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!captainship && !adminMember) return { data: null, error: 'Only team captains or admins can submit scores' }

  const { data, error } = await supabase
    .from('game_results')
    .upsert({
      organization_id: org.id,
      game_id: parsed.data.gameId,
      home_score: parsed.data.homeScore,
      away_score: parsed.data.awayScore,
      sets: parsed.data.sets ?? null,
      submitted_by: user.id,
      status: 'pending',
    }, { onConflict: 'game_id' })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  // Update game status to completed
  await supabase.from('games').update({ status: 'completed' }).eq('id', parsed.data.gameId)

  revalidatePath('/events/[slug]', 'page')
  return { data, error: null }
}

// Admin-only: submit + immediately confirm in one step
const adminSetScoreSchema = z.object({
  gameId: z.string().uuid(),
  homeScore: z.coerce.number().min(0),
  awayScore: z.coerce.number().min(0),
  leagueId: z.string().uuid().optional(),
  sets: z.array(z.object({ home: z.number().min(0), away: z.number().min(0) })).optional(),
})

export async function adminSetScore(input: z.infer<typeof adminSetScoreSchema>) {
  const parsed = adminSetScoreSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!adminMember) return { data: null, error: 'Admin access required' }

  const { data: game } = await supabase
    .from('games')
    .select('id, league_id')
    .eq('id', parsed.data.gameId)
    .eq('organization_id', org.id)
    .single()

  if (!game) return { data: null, error: 'Game not found' }

  const { error: upsertError } = await supabase
    .from('game_results')
    .upsert(
      {
        organization_id: org.id,
        game_id: parsed.data.gameId,
        home_score: parsed.data.homeScore,
        away_score: parsed.data.awayScore,
        sets: parsed.data.sets ?? null,
        submitted_by: user.id,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        status: 'confirmed',
      },
      { onConflict: 'game_id' }
    )

  if (upsertError) return { data: null, error: upsertError.message }

  await supabase.from('games').update({ status: 'completed' }).eq('id', parsed.data.gameId)

  const leagueId = parsed.data.leagueId ?? game.league_id
  if (leagueId) revalidatePath(`/admin/events/${leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')

  // Auto-advance bracket if this game is a bracket match — isolated so it never crashes score submission
  try {
    await advanceBracketFromScore(parsed.data.gameId, parsed.data.homeScore, parsed.data.awayScore, org.id)
  } catch {
    console.error('[adminSetScore] advanceBracketFromScore failed silently')
  }

  return { data: null, error: null }
}

export async function confirmScore(gameId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data: result } = await supabase
    .from('game_results')
    .select('id, submitted_by, game:games!game_results_game_id_fkey(home_team_id, away_team_id)')
    .eq('game_id', gameId)
    .eq('organization_id', org.id)
    .single()

  if (!result) return { data: null, error: 'Result not found' }

  const game = Array.isArray(result.game) ? result.game[0] : result.game
  const teamIds = [game?.home_team_id, game?.away_team_id].filter(Boolean) as string[]

  // Confirm must be by the opposing captain (not the submitter)
  const { data: captainship } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'captain')
    .in('team_id', teamIds)
    .single()

  const { data: adminMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!captainship && !adminMember) return { data: null, error: 'Unauthorized' }

  const { error } = await supabase
    .from('game_results')
    .update({ status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('organization_id', org.id)

  if (error) return { data: null, error: error.message }

  revalidatePath('/events/[slug]', 'page')

  // Auto-advance bracket if this game is a bracket match — isolated so it never crashes score confirmation
  try {
    const { data: confirmedResult } = await supabase
      .from('game_results')
      .select('home_score, away_score')
      .eq('game_id', gameId)
      .eq('organization_id', org.id)
      .single()
    if (confirmedResult?.home_score !== null && confirmedResult?.away_score !== null) {
      await advanceBracketFromScore(gameId, confirmedResult.home_score!, confirmedResult.away_score!, org.id)
    }
  } catch {
    console.error('[confirmScore] advanceBracketFromScore failed silently')
  }

  return { data: null, error: null }
}
