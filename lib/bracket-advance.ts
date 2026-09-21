import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import type { TablesUpdate } from '@/types/database'

// Bracket advancement engine.
//
// These live in lib/ rather than actions/ deliberately. They used to be
// exports of a 'use server' file, which made them callable endpoints — and
// two of them take only strings and numbers, create their own service-role
// client (which bypasses RLS), and carry no authorization of their own.
// Anyone who could discover the action id could advance a chosen team through
// a playoff bracket, or undo a real result, in any organization.
//
// Their only callers are the score actions, which authorize properly before
// calling in. Moving the functions here removes the endpoint entirely rather
// than bolting a second check onto each one.

type Db = ReturnType<typeof createServiceRoleClient>

export async function advanceWinner(
  db: Db,
  orgId: string,
  bracketId: string,
  matchId: string,
  winnerTeamId: string
) {

  const { data: match } = await db
    .from('bracket_matches')
    .select('winner_to_match_id, winner_to_slot')
    .eq('id', matchId)
    .single()

  if (!match?.winner_to_match_id) return

  const updateField = match.winner_to_slot === 1 ? 'team1_id' : 'team2_id'


  const { data: nextMatch } = await db
    .from('bracket_matches')
    .select('id, team1_id, team2_id')
    .eq('id', match.winner_to_match_id)
    .single()

  if (!nextMatch) return

  const otherTeamField = match.winner_to_slot === 1 ? 'team2_id' : 'team1_id'
  const bothFilled = nextMatch[otherTeamField] !== null


  await db.from('bracket_matches')
    .update({
      [updateField]: winnerTeamId,
      status: bothFilled ? 'ready' : 'pending',
    } as TablesUpdate<'bracket_matches'>)
    .eq('id', match.winner_to_match_id)
}

export async function advanceLoser(
  db: Db,
  orgId: string,
  bracketId: string,
  matchId: string,
  loserTeamId: string
) {

  const { data: match } = await db
    .from('bracket_matches')
    .select('loser_to_match_id, loser_to_slot')
    .eq('id', matchId)
    .single()

  if (!match?.loser_to_match_id) return // single elim or no routing defined

  const updateField = match.loser_to_slot === 1 ? 'team1_id' : 'team2_id'


  const { data: nextMatch } = await db
    .from('bracket_matches')
    .select('id, team1_id, team2_id')
    .eq('id', match.loser_to_match_id)
    .single()

  if (!nextMatch) return

  const otherTeamField = match.loser_to_slot === 1 ? 'team2_id' : 'team1_id'
  const bothFilled = nextMatch[otherTeamField] !== null


  await db.from('bracket_matches')
    .update({
      [updateField]: loserTeamId,
      status: bothFilled ? 'ready' : 'pending',
    } as TablesUpdate<'bracket_matches'>)
    .eq('id', match.loser_to_match_id)
}

export async function reverseBracketAdvancement(gameId: string, orgId: string): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()


  const { data: match } = await db
    .from('bracket_matches')
    .select('id, winner_to_match_id, winner_to_slot, loser_to_match_id, loser_to_slot, brackets!bracket_matches_bracket_id_fkey(league_id)')
    .eq('game_id', gameId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!match) return { error: null } // not a bracket game

  // Block if any downstream match is already completed
  const downstreamIds = [match.winner_to_match_id, match.loser_to_match_id].filter((x): x is string => !!x)
  if (downstreamIds.length > 0) {

    const { data: downstream } = await db
      .from('bracket_matches')
      .select('status')
      .in('id', downstreamIds)

    const hasCompleted = (downstream ?? []).some((m: { status: string }) => m.status === 'completed')
    if (hasCompleted) {
      return { error: 'A later bracket match has already been played. Clear that match first.' }
    }
  }

  // Clear winner slot in next match
  if (match.winner_to_match_id) {
    const field = match.winner_to_slot === 1 ? 'team1_id' : 'team2_id'

    await db.from('bracket_matches')
      .update({ [field]: null, status: 'pending', winner_team_id: null } as TablesUpdate<'bracket_matches'>)
      .eq('id', match.winner_to_match_id)
  }

  // Clear loser slot in loser-bracket match (double elimination)
  if (match.loser_to_match_id) {
    const field = match.loser_to_slot === 1 ? 'team1_id' : 'team2_id'

    await db.from('bracket_matches')
      .update({ [field]: null, status: 'pending' } as TablesUpdate<'bracket_matches'>)
      .eq('id', match.loser_to_match_id)
  }

  // Reset this match back to ready (teams still present, score/winner cleared)

  await db.from('bracket_matches')
    .update({ score1: null, score2: null, winner_team_id: null, status: 'ready' })
    .eq('id', match.id)

  const league = Array.isArray(match.brackets) ? match.brackets[0] : match.brackets
  const leagueId = (league as { league_id: string } | null)?.league_id
  if (leagueId) {
    revalidatePath(`/admin/events/${leagueId}/bracket`)
    revalidatePath('/events/[slug]', 'page')
  }

  return { error: null }
}

export async function advanceBracketFromScore(
  gameId: string,
  homeScore: number,
  awayScore: number,
  orgId: string
) {
  const db = createServiceRoleClient()


  const { data: match } = await db
    .from('bracket_matches')
    .select('id, bracket_id, team1_id, team2_id, status, brackets!bracket_matches_bracket_id_fkey(league_id)')
    .eq('game_id', gameId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!match || match.status === 'completed') return

  if (homeScore === awayScore) return // ties not allowed in playoffs

  const winnerTeamId = homeScore > awayScore ? match.team1_id : match.team2_id
  const loserTeamId = homeScore > awayScore ? match.team2_id : match.team1_id
  if (!winnerTeamId) return

  const league = Array.isArray(match.brackets) ? match.brackets[0] : match.brackets
  const leagueId = (league as { league_id: string } | null)?.league_id


  await db.from('bracket_matches')
    .update({
      score1: homeScore,
      score2: awayScore,
      winner_team_id: winnerTeamId,
      status: 'completed',
    })
    .eq('id', match.id)

  await advanceWinner(db, orgId, match.bracket_id, match.id, winnerTeamId)
  if (loserTeamId) {
    await advanceLoser(db, orgId, match.bracket_id, match.id, loserTeamId)
  }

  if (leagueId) {
    revalidatePath(`/admin/events/${leagueId}/bracket`)
    revalidatePath('/events/[slug]', 'page')
  }
}

// ══ Manual brackets M2: structural editing ════════════════════════════════════
// Add/remove matches and rounds, name rounds, toggle byes. Routes are held by
// match id, so structural edits can't corrupt existing wiring — the one hard
// rule is that matches with recorded scores are immutable. The UI surfaces
// these on custom (hand-built) brackets; the actions themselves work on any
// bracket, but anything a generator owns is rebuilt on the next regenerate.

/** Loads a bracket scoped to the caller's org, or null. */
