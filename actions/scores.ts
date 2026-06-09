'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { advanceBracketFromScore, reverseBracketAdvancement } from '@/actions/brackets'
import { recordAuditLog } from '@/lib/audit'
import { isLeagueFrozen } from '@/lib/billing'

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

  const db = createServiceRoleClient()

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
  const { data: adminMember } = await db
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

  const db = createServiceRoleClient()

  const { data: adminMember } = await db
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

  // Block score entry on frozen leagues
  if (game.league_id && await isLeagueFrozen(game.league_id, org.id)) {
    return { data: null, error: 'LEAGUE_FROZEN' }
  }

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

  await recordAuditLog({
    orgId: org.id,
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: 'score.overridden',
    targetType: 'game',
    targetId: parsed.data.gameId,
    metadata: { league_id: leagueId, home_score: parsed.data.homeScore, away_score: parsed.data.awayScore },
  })

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

const VOLLEYBALL_SPORTS = new Set(['volleyball', 'beach_volleyball'])

const recordForfeitSchema = z.object({
  gameId: z.string().uuid(),
  leagueId: z.string().uuid().optional(),
  /** 'home' | 'away' = that side forfeited; 'both' = double forfeit */
  forfeitSide: z.enum(['home', 'away', 'both']),
})

/**
 * Record a forfeit. Assigns a sport-appropriate default score:
 *   - volleyball/beach: winner takes it 2 sets to 0 (25–0, 25–0)
 *   - all other sports: 1–0
 * Double forfeit is recorded 0–0 with no winner (counts as a loss for both
 * via the is_forfeit flag in the standings computations).
 */
export async function recordForfeit(input: z.infer<typeof recordForfeitSchema>) {
  const parsed = recordForfeitSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const { data: adminMember } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()
  if (!adminMember) return { data: null, error: 'Admin access required' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: game } = await (db as any)
    .from('games')
    .select('id, league_id, home_team_id, away_team_id, league:leagues!games_league_id_fkey(sport)')
    .eq('id', parsed.data.gameId)
    .eq('organization_id', org.id)
    .single()
  if (!game) return { data: null, error: 'Game not found' }

  const league = Array.isArray(game.league) ? game.league[0] : game.league
  const isVolleyball = VOLLEYBALL_SPORTS.has(league?.sport ?? '')

  // Build the default forfeit score, oriented to home/away
  let homeScore = 0, awayScore = 0
  let sets: { home: number; away: number }[] | null = null
  let forfeitTeamId: string | null = null

  if (parsed.data.forfeitSide === 'both') {
    homeScore = 0; awayScore = 0; sets = null; forfeitTeamId = null
  } else {
    const homeForfeited = parsed.data.forfeitSide === 'home'
    forfeitTeamId = homeForfeited ? (game.home_team_id ?? null) : (game.away_team_id ?? null)
    if (isVolleyball) {
      // Winner 2 sets to 0, 25–0 each
      homeScore = homeForfeited ? 0 : 2
      awayScore = homeForfeited ? 2 : 0
      sets = homeForfeited
        ? [{ home: 0, away: 25 }, { home: 0, away: 25 }]
        : [{ home: 25, away: 0 }, { home: 25, away: 0 }]
    } else {
      homeScore = homeForfeited ? 0 : 1
      awayScore = homeForfeited ? 1 : 0
    }
  }

  const { error: upsertError } = await (db as any)
    .from('game_results')
    .upsert(
      {
        organization_id: org.id,
        game_id: parsed.data.gameId,
        home_score: homeScore,
        away_score: awayScore,
        sets,
        is_forfeit: true,
        forfeit_team_id: forfeitTeamId,
        submitted_by: user.id,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        status: 'confirmed',
      },
      { onConflict: 'game_id' }
    )
  if (upsertError) return { data: null, error: upsertError.message }

  await (db as any).from('games').update({ status: 'completed' }).eq('id', parsed.data.gameId)

  const leagueId = parsed.data.leagueId ?? game.league_id

  await recordAuditLog({
    orgId: org.id,
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: 'forfeit.recorded',
    targetType: 'game',
    targetId: parsed.data.gameId,
    metadata: { league_id: leagueId, forfeit_side: parsed.data.forfeitSide, forfeit_team_id: forfeitTeamId, home_score: homeScore, away_score: awayScore },
  })

  if (leagueId) revalidatePath(`/admin/events/${leagueId}/schedule`)
  revalidatePath('/events/[slug]', 'page')

  // Advance bracket if applicable (double forfeit has no winner → skip advance)
  if (parsed.data.forfeitSide !== 'both') {
    try {
      await advanceBracketFromScore(parsed.data.gameId, homeScore, awayScore, org.id)
    } catch {
      console.error('[recordForfeit] advanceBracketFromScore failed silently')
    }
  }

  return { data: null, error: null }
}

export async function adminClearScore(gameId: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()

  const { data: adminMember } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .in('role', ['org_admin', 'league_admin'])
    .single()

  if (!adminMember) return { error: 'Admin access required' }

  const { data: game } = await db
    .from('games')
    .select('id, league_id')
    .eq('id', gameId)
    .eq('organization_id', org.id)
    .single()

  if (!game) return { error: 'Game not found' }

  // Reverse bracket advancement first — blocks if a downstream match is completed
  const { error: bracketError } = await reverseBracketAdvancement(gameId, org.id)
  if (bracketError) return { error: bracketError }

  // Delete the game result and reset game status
  await db.from('game_results').delete().eq('game_id', gameId)
  await db.from('games').update({ status: 'scheduled' }).eq('id', gameId)

  if (game.league_id) {
    revalidatePath(`/admin/events/${game.league_id}/schedule`)
    revalidatePath(`/admin/events/${game.league_id}/bracket`)
  }
  revalidatePath('/events/[slug]', 'page')

  return { error: null }
}

export async function confirmScore(gameId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const db = createServiceRoleClient()

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

  const { data: adminMember } = await db
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
    if (confirmedResult && confirmedResult.home_score !== null && confirmedResult.away_score !== null) {
      await advanceBracketFromScore(gameId, confirmedResult.home_score, confirmedResult.away_score, org.id)
    }
  } catch {
    console.error('[confirmScore] advanceBracketFromScore failed silently')
  }

  return { data: null, error: null }
}
