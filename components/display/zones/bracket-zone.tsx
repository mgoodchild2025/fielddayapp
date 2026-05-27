import type { DisplayBracketMatch, ZoneConfig } from '@/lib/display-types'
import { FitContent } from './fit-content'

interface Props {
  bracket: { rounds: number; matches: DisplayBracketMatch[] } | null
  config:  Extract<ZoneConfig, { type: 'bracket' }>
  theme:   'dark' | 'light'
}

/**
 * Round numbers in the DB are inverted — round_number=1 is always the Final,
 * round_number=2 is Semi-Finals, round_number=4 is Quarter-Finals, and the
 * first round (most matches) gets the highest number.
 */
function getRoundLabel(roundNumber: number): string {
  if (roundNumber === 1) return 'Final'
  if (roundNumber === 2) return 'Semi-Finals'
  if (roundNumber === 4) return 'Quarter-Finals'
  const teamsInRound = roundNumber * 2
  if (teamsInRound === 16) return 'Round of 16'
  if (teamsInRound === 8) return 'Round of 8'
  if (teamsInRound >= 32) return `Round of ${teamsInRound}`
  return `Round of ${teamsInRound}`
}

/**
 * Returns the subset of round numbers to show, given all unique round numbers
 * (sorted high → low, i.e. first round → final).
 */
function getVisibleRoundNums(
  allRounds: number[],
  filter: Extract<ZoneConfig, { type: 'bracket' }>['round_filter'],
): number[] {
  switch (filter) {
    // ── Single-round views (by known round_number) ────────────────────────────
    case 'final':    return allRounds.filter((r) => r === 1)
    case 'semis':    return allRounds.filter((r) => r === 2)
    case 'quarters': return allRounds.filter((r) => r === 4)
    // "first" = highest round_number = the opening round with the most matches
    case 'first':    return allRounds.length > 0 ? [allRounds[0]] : []
    // ── Multi-round views (last N in bracket order, final on the right) ───────
    // allRounds is high→low, so "last 2" = last 2 elements = [semis, final]
    case 'last_2':   return allRounds.slice(-2)
    case 'last_3':   return allRounds.slice(-3)
    default:         return allRounds
  }
}

export function BracketZone({ bracket, config, theme }: Props) {
  const isDark = theme === 'dark'

  if (!bracket || bracket.matches.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
          <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
            Bracket
          </h2>
        </div>
        <div className={`flex items-center justify-center flex-1 text-lg ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          Bracket not yet available
        </div>
      </div>
    )
  }

  const { matches } = bracket

  // Derive the unique round numbers present in the data, sorted high → low
  // (high = first round with most matches, low = 1 = final)
  const allRoundNums = [...new Set(matches.map((m) => m.round_number))].sort((a, b) => b - a)

  // Apply the round filter to get which rounds to display
  const visibleRoundNums = getVisibleRoundNums(allRoundNums, config.round_filter)

  // Group matches by round_number
  const byRound = new Map<number, DisplayBracketMatch[]>()
  for (const r of visibleRoundNums) byRound.set(r, [])
  for (const m of matches) {
    if (byRound.has(m.round_number)) {
      byRound.get(m.round_number)!.push(m)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          Bracket
        </h2>
      </div>

      {/* Auto-fit bracket — all visible rounds scale to fill the zone */}
      <FitContent>
        <div className="flex gap-3 p-3 items-start">
          {visibleRoundNums.map((roundNum) => {
            const roundMatches = byRound.get(roundNum) ?? []
            return (
              <div key={roundNum} className="flex flex-col gap-2 min-w-[180px]">
                {/* Round header */}
                <div className={`text-xs font-bold uppercase tracking-wider text-center pb-1 ${
                  isDark ? 'text-zinc-400' : 'text-gray-500'
                }`}>
                  {getRoundLabel(roundNum)}
                </div>

                {/* Matches in this round */}
                {roundMatches.map((m) => {
                  const t1Wins = m.score1 !== null && m.score2 !== null && m.score1 > m.score2
                  const t2Wins = m.score1 !== null && m.score2 !== null && m.score2 > m.score1
                  const hasScore = m.score1 !== null || m.score2 !== null

                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg overflow-hidden border text-sm ${
                        isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-200 bg-white'
                      } ${m.is_bye ? 'opacity-50' : ''}`}
                    >
                      {/* Team 1 */}
                      <div className={`flex items-center justify-between px-3 py-2 border-b ${
                        isDark ? 'border-zinc-700' : 'border-gray-100'
                      } ${t1Wins ? isDark ? 'bg-emerald-900/30' : 'bg-emerald-50' : ''}`}>
                        <span className={`font-semibold truncate ${
                          t1Wins
                            ? isDark ? 'text-emerald-300' : 'text-emerald-700'
                            : !hasScore
                            ? isDark ? 'text-zinc-200' : 'text-gray-800'
                            : isDark ? 'text-zinc-400' : 'text-gray-400'
                        }`}>
                          {m.team1_name ?? '—'}
                        </span>
                        {m.score1 !== null && (
                          <span className={`font-bold tabular-nums ml-2 shrink-0 ${
                            t1Wins ? isDark ? 'text-emerald-300' : 'text-emerald-700' : isDark ? 'text-zinc-400' : 'text-gray-500'
                          }`}>
                            {m.score1}
                          </span>
                        )}
                      </div>

                      {/* Team 2 */}
                      <div className={`flex items-center justify-between px-3 py-2 ${
                        t2Wins ? isDark ? 'bg-emerald-900/30' : 'bg-emerald-50' : ''
                      }`}>
                        <span className={`font-semibold truncate ${
                          m.is_bye
                            ? isDark ? 'text-zinc-600' : 'text-gray-300'
                            : t2Wins
                            ? isDark ? 'text-emerald-300' : 'text-emerald-700'
                            : !hasScore
                            ? isDark ? 'text-zinc-200' : 'text-gray-800'
                            : isDark ? 'text-zinc-400' : 'text-gray-400'
                        }`}>
                          {m.is_bye ? 'Bye' : (m.team2_name ?? '—')}
                        </span>
                        {m.score2 !== null && !m.is_bye && (
                          <span className={`font-bold tabular-nums ml-2 shrink-0 ${
                            t2Wins ? isDark ? 'text-emerald-300' : 'text-emerald-700' : isDark ? 'text-zinc-400' : 'text-gray-500'
                          }`}>
                            {m.score2}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </FitContent>
    </div>
  )
}
