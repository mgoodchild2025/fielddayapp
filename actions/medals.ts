'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { deriveLeagueMedals, medalGlyph, type MedalTierLite, type MedalMatchLite } from '@/lib/medals'

// ── The Trophy Case: awarding ─────────────────────────────────────────────────
// Medals are awarded and FROZEN: recipients snapshot the team roster at award
// time, so the medal outlives roster churn, bracket regeneration, and team
// deletion. awardLeagueMedals is idempotent — it replaces the league's medals —
// and runs automatically when an event is marked completed (actions/events.ts).

async function getOrgAndRequireAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  return org
}

type Db = ReturnType<typeof createServiceRoleClient>

/** Loads the league's tiers (or standalone brackets) in medal-derivation shape. */
async function loadTiersForLeague(db: Db, orgId: string, leagueId: string): Promise<MedalTierLite[]> {
  // Tiered playoffs: ordered playoff_tiers → their brackets
  const { data: config } = await db
    .from('playoff_configs').select('id')
    .eq('league_id', leagueId).eq('organization_id', orgId).maybeSingle()

  let tierDefs: { name: string; bracket_id: string; third_place_game: boolean }[] = []
  if (config) {
    const { data: tiers } = await db
      .from('playoff_tiers')
      .select('name, bracket_id, third_place_game, sort_order')
      .eq('config_id', config.id)
      .order('sort_order', { ascending: true })
    tierDefs = (tiers ?? [])
      .filter((t): t is typeof t & { bracket_id: string } => !!t.bracket_id)
      .map((t) => ({ name: t.name, bracket_id: t.bracket_id!, third_place_game: t.third_place_game }))
  }

  // No tiers (or none with brackets): standalone bracket(s) act as one top tier
  if (tierDefs.length === 0) {
    const { data: brackets } = await db
      .from('brackets')
      .select('id, name, third_place_game')
      .eq('league_id', leagueId).eq('organization_id', orgId)
      .order('created_at', { ascending: true })
    tierDefs = (brackets ?? []).map((b) => ({ name: b.name, bracket_id: b.id, third_place_game: b.third_place_game }))
  }
  if (tierDefs.length === 0) return []

  const { data: matches } = await db
    .from('bracket_matches')
    .select('id, bracket_id, round_number, match_number, team1_id, team2_id, winner_team_id, status, is_bye, medal_match')
    .in('bracket_id', tierDefs.map((t) => t.bracket_id))

  const byBracket = new Map<string, MedalMatchLite[]>()
  for (const m of matches ?? []) {
    const list = byBracket.get(m.bracket_id) ?? []
    list.push({
      id: m.id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      team1Id: m.team1_id,
      team2Id: m.team2_id,
      winnerTeamId: m.winner_team_id,
      status: m.status,
      isBye: m.is_bye,
      medalMatch: (m.medal_match as 'gold' | 'bronze' | null) ?? null,
    })
    byBracket.set(m.bracket_id, list)
  }

  return tierDefs.map((t) => ({
    tierName: t.name,
    bracketId: t.bracket_id,
    thirdPlaceGame: t.third_place_game,
    matches: byBracket.get(t.bracket_id) ?? [],
  }))
}

/**
 * Derives and writes the league's medals. Idempotent: replaces any medals the
 * league already has. Notifies recipients the first time a medal reaches them
 * (skipped on re-runs that produce the same placement for the same team).
 */
export async function awardLeagueMedals(
  leagueId: string
): Promise<{ error: string | null; awarded: number }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()
  return awardLeagueMedalsInternal(db, org.id, leagueId)
}

/** Internal variant for hooks that have already authenticated (event completion). */
export async function awardLeagueMedalsInternal(
  db: Db,
  orgId: string,
  leagueId: string
): Promise<{ error: string | null; awarded: number }> {
  const { data: league } = await db
    .from('leagues').select('id, name, slug')
    .eq('id', leagueId).eq('organization_id', orgId).maybeSingle()
  if (!league) return { error: 'Event not found', awarded: 0 }

  const tiers = await loadTiersForLeague(db, orgId, leagueId)
  const derived = deriveLeagueMedals(tiers)

  // What already exists — used to keep notifications first-time-only
  const { data: existing } = await db
    .from('medals')
    .select('team_id, placement, label')
    .eq('league_id', leagueId)
  const existingKeys = new Set((existing ?? []).map((m) => `${m.team_id}:${m.placement}:${m.label}`))

  // Replace: the award pass owns this league's medals
  await db.from('medals').delete().eq('league_id', leagueId).eq('organization_id', orgId)
  if (derived.length === 0) {
    revalidatePath(`/admin/events/${leagueId}/bracket`)
    return { error: null, awarded: 0 }
  }

  // Team names + rosters, snapshotted now
  const teamIds = [...new Set(derived.map((d) => d.teamId))]
  const [{ data: teams }, { data: members }] = await Promise.all([
    db.from('teams').select('id, name').in('id', teamIds),
    db.from('team_members')
      .select('team_id, user_id, profile:profiles!team_members_user_id_fkey(full_name)')
      .in('team_id', teamIds)
      .eq('status', 'active'),
  ])
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]))
  const roster = new Map<string, { userId: string; name: string }[]>()
  for (const m of members ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile as any
    if (!m.user_id) continue // roster snapshot only covers account holders
    const list = roster.get(m.team_id) ?? []
    list.push({ userId: m.user_id, name: profile?.full_name ?? 'Player' })
    roster.set(m.team_id, list)
  }

  let awarded = 0
  for (const d of derived) {
    const { data: medal, error } = await db.from('medals').insert({
      organization_id: orgId,
      league_id: leagueId,
      league_name: league.name,
      team_id: d.teamId,
      team_name: teamName.get(d.teamId) ?? 'Team',
      placement: d.placement,
      label: d.label,
      bracket_id: d.bracketId,
      deciding_match_id: d.decidingMatchId,
    }).select('id').single()
    if (error || !medal) continue

    const recipients = roster.get(d.teamId) ?? []
    if (recipients.length > 0) {
      await db.from('medal_recipients').insert(
        recipients.map((r) => ({
          medal_id: medal.id,
          organization_id: orgId,
          user_id: r.userId,
          display_name: r.name,
        }))
      )
    }
    awarded++

    // First-time notification only — re-running after a correction shouldn't re-ping
    if (!existingKeys.has(`${d.teamId}:${d.placement}:${d.label}`) && recipients.length > 0) {
      const glyph = medalGlyph(d.placement)
      await db.from('notifications').insert(
        recipients.map((r) => ({
          organization_id: orgId,
          user_id: r.userId,
          type: 'medal_awarded',
          title: `${glyph} You earned a medal!`,
          body: `${d.label} — ${league.name}. It's in your trophy case.`,
          data: { medalId: medal.id, leagueId, placement: d.placement },
        }))
      )
    }
  }

  revalidatePath(`/admin/events/${leagueId}/bracket`)
  revalidatePath('/dashboard')
  revalidatePath('/events/[slug]', 'page')
  return { error: null, awarded }
}

/** Removes one medal (disputes, hand corrections). */
export async function revokeMedal(medalId: string, leagueId: string): Promise<{ error: string | null }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()
  const { error } = await db.from('medals').delete().eq('id', medalId).eq('organization_id', org.id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/events/${leagueId}/bracket`)
  return { error: null }
}

/**
 * Backfill: award medals for every already-completed event in the org, so
 * long-tenured champions wake up to full trophy cases. Safe to re-run.
 */
export async function backfillOrgMedals(): Promise<{ error: string | null; events: number; awarded: number }> {
  const org = await getOrgAndRequireAdmin()
  const db = createServiceRoleClient()

  const { data: leagues } = await db
    .from('leagues')
    .select('id')
    .eq('organization_id', org.id)
    .in('status', ['completed', 'archived'])

  let events = 0
  let awarded = 0
  for (const l of leagues ?? []) {
    const r = await awardLeagueMedalsInternal(db, org.id, l.id)
    if (!r.error && r.awarded > 0) { events++; awarded += r.awarded }
  }
  return { error: null, events, awarded }
}
