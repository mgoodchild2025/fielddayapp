import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { getScoreStructure } from '@/lib/print-config'
import { roundDisplayName } from '@/lib/bracket'
import { PrintControls } from '@/components/print/print-controls'
import { BracketSheet, type BracketMatch } from '@/components/print/bracket-sheet'
import { GameScoreSheet } from '@/components/print/game-score-sheet'
import { requireOrgMember } from '@/lib/auth'
import { trustedOrigin } from '@/lib/trusted-origin'
import { scoreScanPath } from '@/lib/score-scan'
import { tierColor, stageColor, slotHint, type FeedSource } from '@/lib/bracket-print'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bracket (print)' }

export default async function BracketPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ bracketId?: string; type?: string }>
}) {
  const { id } = await params
  const { bracketId, type } = await searchParams

  if (!bracketId) notFound()

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])
  const scope = await getAdminScope(org.id)
  if (!scope.isOrgAdmin) notFound()

  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  // Org name + timezone
  const [{ data: branding }, { data: orgRow }] = await Promise.all([

    db.from('org_branding').select('timezone').eq('organization_id', org.id).single(),

    db.from('organizations').select('name').eq('id', org.id).single(),
  ])
  const timezone = branding?.timezone ?? 'America/Toronto'
  const orgName = orgRow?.name ?? 'Fieldday'

  // League info

  const { data: league } = await db
    .from('leagues')
    .select('name, sport')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()
  const leagueName: string = league.name ?? 'League'
  const sport: string = league.sport ?? ''

  // Bracket + matches

  const { data: rawBracket } = await db
    .from('brackets')
    .select(`
      id, name, bracket_size, bracket_type, round_names, status,
      bracket_matches(
        id, round_number, match_number,
        team1_id, team2_id, team1_label, team2_label,
        team1_seed, team2_seed, is_bye, winner_team_id,
        winner_to_match_id, scheduled_at, court
      )
    `)
    .eq('id', bracketId)
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .single()

  if (!rawBracket) notFound()

  // Team name map
  const { data: teams } = await db
    .from('teams')
    .select('id, name')
    .eq('league_id', id)
    .eq('organization_id', org.id)

  const teamNameMap = new Map<string, string>((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  // Map raw matches to BracketMatch[]
  const matches: BracketMatch[] = (rawBracket.bracket_matches ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.round_number - b.round_number || a.match_number - b.match_number)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      team1Name: m.team1_id ? (teamNameMap.get(m.team1_id) ?? null) : null,
      team2Name: m.team2_id ? (teamNameMap.get(m.team2_id) ?? null) : null,
      team1Seed: m.team1_seed,
      team2Seed: m.team2_seed,
      team1Label: m.team1_label,
      team2Label: m.team2_label,
      isBye: m.is_bye,
      court: m.court,
      scheduledAt: m.scheduled_at,
      winnerToMatchId: m.winner_to_match_id,
    }))

  const scoreStructure = getScoreStructure(sport)
  const bracketName: string = rawBracket.name ?? 'Bracket'
  const bracketSize: number = rawBracket.bracket_size ?? 0
  const roundNames = (rawBracket.round_names as Record<string, string> | null) ?? null

  // ─── Individual score sheets (one per match) ────────────────────────────────
  if (type === 'scoresheets') {
    const sheetMatches = matches.filter((m) => !m.isBye)
    const ids = sheetMatches.map((m) => m.id)

    // The tier this bracket belongs to (its name + colour), and every route
    // INTO these matches — from this bracket or a drop-down from another — so
    // an empty slot can say "Winner of QF Match 2".
    const [{ data: tier }, { data: feeds }, origin] = await Promise.all([
      db.from('playoff_tiers').select('name, sort_order')
        .eq('bracket_id', bracketId).eq('organization_id', org.id).maybeSingle(),
      ids.length
        ? db.from('bracket_matches')
            .select('round_number, match_number, winner_to_match_id, winner_to_slot, loser_to_match_id, loser_to_slot, bracket:brackets!bracket_matches_bracket_id_fkey(id, name, bracket_size, round_names)')
            .eq('organization_id', org.id)
            .or(`winner_to_match_id.in.(${ids.join(',')}),loser_to_match_id.in.(${ids.join(',')})`)
        : Promise.resolve({ data: [] }),
      trustedOrigin(headersList),
    ])

    const feedInto = new Map<string, FeedSource>() // `${matchId}:${slot}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const f of (feeds ?? []) as any[]) {
      const b = Array.isArray(f.bracket) ? f.bracket[0] : f.bracket
      const source = {
        stage: roundDisplayName(b?.round_names ?? null, f.round_number, b?.bracket_size ?? 0, f.match_number),
        matchNumber: f.match_number,
        bracketName: b && b.id !== bracketId ? b.name : null,
      }
      if (f.winner_to_match_id && f.winner_to_slot) feedInto.set(`${f.winner_to_match_id}:${f.winner_to_slot}`, { outcome: 'winner', ...source })
      if (f.loser_to_match_id && f.loser_to_slot) feedInto.set(`${f.loser_to_match_id}:${f.loser_to_slot}`, { outcome: 'loser', ...source })
    }

    const tierName = tier?.name ?? bracketName
    const tierFill = tierColor(tierName, tier?.sort_order ?? 0)

    return (
      <PrintPage>
        <PrintControls />
        {sheetMatches.map((m, i) => {
          const stage = roundDisplayName(roundNames, m.roundNumber, bracketSize, m.matchNumber)
          const game = {
            id: m.id,
            scheduledAt: m.scheduledAt ?? null,
            court: m.court,
            weekNumber: null,
            // Seeded teams print large; empty slots get a write-in line.
            homeTeamName: m.team1Name ? (m.team1Seed !== null ? `(${m.team1Seed}) ${m.team1Name}` : m.team1Name) : null,
            awayTeamName: m.team2Name ? (m.team2Seed !== null ? `(${m.team2Seed}) ${m.team2Name}` : m.team2Name) : null,
            homeHint: slotHint({ seed: m.team1Seed, label: m.team1Label, feed: feedInto.get(`${m.id}:1`) ?? null }),
            awayHint: slotHint({ seed: m.team2Seed, label: m.team2Label, feed: feedInto.get(`${m.id}:2`) ?? null }),
          }
          return (
            <div key={m.id} style={i < sheetMatches.length - 1 ? { breakAfter: 'page' } : {}}>
              <GameScoreSheet
                game={game}
                scoreStructure={scoreStructure}
                leagueName={leagueName}
                orgName={orgName}
                timezone={timezone ?? 'America/Toronto'}
                scanUrl={`${origin}${scoreScanPath(m.id)}`}
                matchBanner={{
                  tier: tierName,
                  tierColor: tierFill,
                  stage,
                  stageColor: stageColor(m.roundNumber, m.matchNumber),
                  matchNumber: m.matchNumber,
                }}
              />
            </div>
          )
        })}
      </PrintPage>
    )
  }

  // ─── Bracket overview sheet ─────────────────────────────────────────────────
  return (
    <PrintPage>
      <PrintControls />
      <BracketSheet
        bracketName={bracketName}
        leagueName={leagueName}
        orgName={orgName}
        sport={sport}
        timezone={timezone}
        matches={matches}
        scoreStructure={scoreStructure}
      />
    </PrintPage>
  )
}

// Minimal wrapper with print CSS
function PrintPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0; }

          html, body, div, main, section, article {
            background: white !important;
            background-color: white !important;
          }

          html, body {
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
          }

          body  { print-color-adjust: exact; -webkit-print-color-adjust: exact; }

          .print-page-wrapper {
            max-width: none !important;
            padding: 0.5in !important;
            margin: 0 !important;
          }

          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="print-page-wrapper max-w-[8.5in] mx-auto p-8">
        {children}
      </div>
    </>
  )
}
