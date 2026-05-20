import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { getScoreStructure } from '@/lib/print-config'
import { getRoundName } from '@/lib/bracket'
import { PrintControls } from '@/components/print/print-controls'
import { BracketSheet, type BracketMatch } from '@/components/print/bracket-sheet'
import { GameScoreSheet } from '@/components/print/game-score-sheet'

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
  const scope = await getAdminScope(org.id)
  if (!scope.isOrgAdmin) notFound()

  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  // Org name + timezone
  const [{ data: branding }, { data: orgRow }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('organizations').select('name').eq('id', org.id).single(),
  ])
  const timezone = branding?.timezone ?? 'America/Toronto'
  const orgName = orgRow?.name ?? 'Fieldday'

  // League info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('name, sport')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single()

  if (!league) notFound()
  const leagueName: string = league.name ?? 'League'
  const sport: string = league.sport ?? ''

  // Bracket + matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawBracket } = await (db as any)
    .from('brackets')
    .select(`
      id, name, bracket_size, bracket_type, status,
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

  // ─── Individual score sheets (one per match) ────────────────────────────────
  if (type === 'scoresheets') {
    const sheetMatches = matches.filter((m) => !m.isBye)

    function teamLabel(
      name: string | null,
      label: string | null,
      seed: number | null,
      roundNumber: number,
      matchNumber: number,
      position: 1 | 2,
    ): string {
      const display = name ?? label
      if (!display) {
        // No team assigned yet — show seed placeholder or generic TBD
        if (seed !== null) return `Seed ${seed}`
        return `TBD (${getRoundName(roundNumber, bracketSize)} M${matchNumber} ${position === 1 ? 'Home' : 'Away'})`
      }
      return seed !== null ? `(${seed}) ${display}` : display
    }

    return (
      <PrintPage>
        <PrintControls />
        {sheetMatches.map((m, i) => {
          const game = {
            id: m.id,
            scheduledAt: m.scheduledAt ?? new Date().toISOString(),
            court: m.court,
            weekNumber: null,
            homeTeamName: teamLabel(m.team1Name, m.team1Label, m.team1Seed, m.roundNumber, m.matchNumber, 1),
            awayTeamName: teamLabel(m.team2Name, m.team2Label, m.team2Seed, m.roundNumber, m.matchNumber, 2),
          }
          return (
            <div key={m.id} style={i < sheetMatches.length - 1 ? { breakAfter: 'page' } : {}}>
              {/* Round / match label above each sheet */}
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">
                {bracketName} · {getRoundName(m.roundNumber, bracketSize)} · Match {m.matchNumber}
              </p>
              <GameScoreSheet
                game={game}
                scoreStructure={scoreStructure}
                leagueName={leagueName}
                orgName={orgName}
                timezone={timezone ?? 'America/Toronto'}
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
          @page { size: letter portrait; margin: 0.5in; }

          html, body {
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
          }

          body  { print-color-adjust: exact; -webkit-print-color-adjust: exact; }

          .print-page-wrapper {
            max-width: none !important;
            padding: 0 !important;
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
