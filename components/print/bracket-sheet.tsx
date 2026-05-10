import { formatGameTime } from '@/lib/format-time'
import type { ScoreStructure } from '@/lib/print-config'

export interface BracketMatch {
  id: string
  roundNumber: number
  matchNumber: number
  team1Name: string | null
  team2Name: string | null
  team1Seed: number | null
  team2Seed: number | null
  team1Label: string | null
  team2Label: string | null
  isBye: boolean
  court: string | null
  scheduledAt: string | null
  winnerToMatchId: string | null
}

interface Props {
  bracketName: string
  leagueName: string
  orgName: string
  sport: string
  timezone: string
  matches: BracketMatch[]
  scoreStructure: ScoreStructure
}

/** Compute round label based on position from the end */
function getRoundLabel(roundNumber: number, sortedRounds: number[]): string {
  const fromEnd = sortedRounds.length - sortedRounds.indexOf(roundNumber) - 1
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinal'
  if (fromEnd === 2) return 'Quarterfinal'
  return `Round ${roundNumber}`
}

/** Resolve team display string */
function teamDisplay(
  name: string | null,
  label: string | null,
  seed: number | null,
  matchNumber: number,
  position: 1 | 2,
): string {
  const displayName = name ?? label

  if (!displayName) {
    // Both null — show TBD placeholder
    return `Winner of M${matchNumber}`
  }

  if (seed !== null) {
    return `(${seed}) ${displayName}`
  }
  return displayName
}

/** Empty score box */
function ScoreBox({ wide = false }: { wide?: boolean }) {
  return (
    <span
      className={`inline-block border border-gray-400 rounded h-7 text-center align-middle ${wide ? 'w-20' : 'w-8'}`}
    />
  )
}

/** Score boxes section based on score structure */
function ScoreBoxes({ scoreStructure }: { scoreStructure: ScoreStructure }) {
  if (scoreStructure.type === 'sets') {
    return (
      <span className="font-mono inline-flex items-center gap-1 text-xs text-gray-500">
        {Array.from({ length: scoreStructure.count }, (_, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            <span className="text-[10px] text-gray-400">S{i + 1}</span>
            <ScoreBox />
          </span>
        ))}
        <span className="ml-1 inline-flex items-center gap-0.5">
          <span className="text-[10px] text-gray-400">W</span>
          <ScoreBox wide />
        </span>
      </span>
    )
  }

  if (scoreStructure.type === 'periods' || scoreStructure.type === 'halves') {
    return (
      <span className="font-mono inline-flex items-center gap-1 text-xs text-gray-500">
        <ScoreBox />
        <span className="text-gray-400">–</span>
        <ScoreBox />
        <span className="ml-1 inline-flex items-center gap-0.5">
          <span className="text-[10px] text-gray-400">W</span>
          <ScoreBox wide />
        </span>
      </span>
    )
  }

  // 'final', 'innings', or default
  return (
    <span className="font-mono inline-flex items-center gap-1 text-xs text-gray-500">
      <ScoreBox />
      <span className="text-gray-400">–</span>
      <ScoreBox />
    </span>
  )
}

export function BracketSheet({
  bracketName,
  leagueName,
  orgName,
  timezone,
  matches,
  scoreStructure,
}: Props) {
  // Filter out byes and group real matches by round
  const realMatches = matches.filter((m) => !m.isBye)

  const roundNumbers = Array.from(new Set(realMatches.map((m) => m.roundNumber))).sort((a, b) => a - b)

  const byRound = new Map<number, BracketMatch[]>()
  for (const m of realMatches) {
    if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, [])
    byRound.get(m.roundNumber)!.push(m)
  }

  const printedAt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date())

  return (
    <div className="font-sans text-black">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{orgName}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{leagueName}</p>
          <p className="text-xs text-gray-500">{bracketName} — Playoffs</p>
        </div>
      </div>

      <div className="border-t-2 border-black mb-4" />

      {/* Rounds */}
      <div className="space-y-6">
        {roundNumbers.map((roundNum) => {
          const roundMatches = (byRound.get(roundNum) ?? []).sort((a, b) => a.matchNumber - b.matchNumber)
          const label = getRoundLabel(roundNum, roundNumbers)

          return (
            <div key={roundNum}>
              {/* Round heading */}
              <p className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-1">{label}</p>
              <div className="border-b border-gray-300 mb-2" />

              {/* Match rows */}
              <div className="space-y-0">
                {roundMatches.map((match) => {
                  const time = match.scheduledAt
                    ? formatGameTime(match.scheduledAt, timezone).time
                    : '—'
                  const court = match.court ?? '—'

                  const t1 = teamDisplay(match.team1Name, match.team1Label, match.team1Seed, match.matchNumber, 1)
                  const t2 = teamDisplay(match.team2Name, match.team2Label, match.team2Seed, match.matchNumber, 2)

                  return (
                    <div
                      key={match.id}
                      className="flex items-center gap-3 py-1.5 border-b border-gray-100 text-sm"
                    >
                      {/* Time */}
                      <span className="w-16 shrink-0 tabular-nums text-xs text-gray-600">{time}</span>

                      {/* Court */}
                      <span className="w-10 shrink-0 text-xs text-gray-500">Ct {court}</span>

                      {/* Teams */}
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{t1}</span>
                        <span className="text-gray-400 mx-2">vs</span>
                        <span className="font-medium">{t2}</span>
                      </span>

                      {/* Score boxes */}
                      <span className="shrink-0">
                        <ScoreBoxes scoreStructure={scoreStructure} />
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {realMatches.length === 0 && (
          <p className="text-sm text-gray-400 italic py-4 text-center">No matches scheduled.</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t-2 border-black mt-8 pt-2 flex items-center justify-between text-xs text-gray-500">
        <span>Printed: {printedAt}</span>
        <span>{orgName} · Powered by Fieldday</span>
      </div>
    </div>
  )
}
