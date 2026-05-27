import type { DisplayBracketMatch } from '@/lib/display-types'

interface Props {
  bracket: { rounds: number; matches: DisplayBracketMatch[] } | null
  theme: 'dark' | 'light'
}

function getRoundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-Finals'
  if (fromEnd === 2) return 'Quarter-Finals'
  return `Round ${round}`
}

export function BracketZone({ bracket, theme }: Props) {
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

  const { rounds, matches } = bracket

  // Group matches by round
  const byRound = new Map<number, DisplayBracketMatch[]>()
  for (let r = 1; r <= rounds; r++) byRound.set(r, [])
  for (const m of matches) {
    byRound.get(m.round_number)?.push(m)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          Bracket
        </h2>
      </div>

      {/* Horizontal scrolling bracket */}
      <div className="flex-1 overflow-auto p-3">
        <div className="flex gap-3 h-full items-start min-w-max">
          {Array.from(byRound.entries()).map(([roundNum, roundMatches]) => (
            <div key={roundNum} className="flex flex-col gap-2 min-w-[180px]">
              {/* Round header */}
              <div className={`text-xs font-bold uppercase tracking-wider text-center pb-1 ${
                isDark ? 'text-zinc-400' : 'text-gray-500'
              }`}>
                {getRoundLabel(roundNum, rounds)}
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
          ))}
        </div>
      </div>
    </div>
  )
}
