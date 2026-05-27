import type { DisplayBracketMatch, ZoneConfig } from '@/lib/display-types'
import { FitContent } from './fit-content'

type Tier = { name: string | null; matches: DisplayBracketMatch[] }

interface Props {
  bracket: { tiers: Tier[] } | null
  config:  Extract<ZoneConfig, { type: 'bracket' }>
  theme:   'dark' | 'light'
}

// ── Layout constants ──────────────────────────────────────────────────────────
// These mirror the admin BracketDiagram constants (148px match height, 24px gap,
// 224px column width) but scaled down for TV display — no edit buttons needed.
const MATCH_H  = 80    // height of each match card in px
const MATCH_GAP = 20   // vertical gap between cards in the same round
const COL_W    = 216   // full column width (match card sits with 8px inset each side)
const ARM_W    = 8     // width of each horizontal connector arm (left and right)

// ── Round label ───────────────────────────────────────────────────────────────
// round_number in the DB is inverted: 1 = Final, 2 = Semis, 4 = QF, etc.
function getRoundLabel(roundNumber: number): string {
  if (roundNumber === 1) return 'Final'
  if (roundNumber === 2) return 'Semi-Finals'
  if (roundNumber === 4) return 'Quarter-Finals'
  return `Round of ${roundNumber * 2}`
}

// ── Round filter ──────────────────────────────────────────────────────────────
// allRounds is sorted high → low (first round first, final last).
function getVisibleRoundNums(
  allRounds: number[],
  filter: Extract<ZoneConfig, { type: 'bracket' }>['round_filter'],
): number[] {
  switch (filter) {
    case 'final':    return allRounds.filter((r) => r === 1)
    case 'semis':    return allRounds.filter((r) => r === 2)
    case 'quarters': return allRounds.filter((r) => r === 4)
    case 'first':    return allRounds.length > 0 ? [allRounds[0]] : []
    case 'last_2':   return allRounds.slice(-2)   // last 2 before final (semis + final)
    case 'last_3':   return allRounds.slice(-3)
    default:         return allRounds
  }
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({ match, isDark }: { match: DisplayBracketMatch; isDark: boolean }) {
  const t1Wins  = match.score1 !== null && match.score2 !== null && match.score1 > match.score2
  const t2Wins  = match.score1 !== null && match.score2 !== null && match.score2 > match.score1
  const hasScore = match.score1 !== null || match.score2 !== null
  // TBD match — both team slots empty and no score
  const isTbd   = !hasScore && match.team1_name === null && match.team2_name === null

  const border = isDark ? '#3f3f46' : '#e5e7eb'
  const bg     = isDark ? '#18181b' : '#ffffff'
  const divBg  = isDark ? 'rgba(6,78,59,0.30)' : '#f0fdf4'

  const nameColor = (wins: boolean, bye: boolean) => {
    if (bye)       return isDark ? '#52525b' : '#d1d5db'
    if (wins)      return isDark ? '#6ee7b7' : '#065f46'
    if (hasScore)  return isDark ? '#71717a' : '#9ca3af'
    return isDark ? '#e4e4e7' : '#111827'
  }

  const scoreColor = (wins: boolean) =>
    wins ? (isDark ? '#6ee7b7' : '#065f46') : (isDark ? '#71717a' : '#6b7280')

  return (
    <div style={{
      width: '100%',
      height: MATCH_H,
      borderRadius: 8,
      overflow: 'hidden',
      border: `1px solid ${border}`,
      backgroundColor: bg,
      opacity: isTbd ? 0.45 : 1,
      fontSize: 13,
      lineHeight: 1,
    }}>
      {/* Team 1 row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        height: MATCH_H / 2,
        borderBottom: `1px solid ${border}`,
        backgroundColor: t1Wins ? divBg : 'transparent',
      }}>
        <span style={{
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          color: nameColor(t1Wins, false),
        }}>
          {match.team1_name ?? '—'}
        </span>
        {match.score1 !== null && (
          <span style={{
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            marginLeft: 6,
            flexShrink: 0,
            color: scoreColor(t1Wins),
          }}>
            {match.score1}
          </span>
        )}
      </div>

      {/* Team 2 row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        height: MATCH_H / 2,
        backgroundColor: t2Wins ? divBg : 'transparent',
      }}>
        <span style={{
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          color: nameColor(t2Wins, match.is_bye),
          fontStyle: match.is_bye ? 'italic' : 'normal',
        }}>
          {match.is_bye ? 'Bye' : (match.team2_name ?? '—')}
        </span>
        {match.score2 !== null && !match.is_bye && (
          <span style={{
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            marginLeft: 6,
            flexShrink: 0,
            color: scoreColor(t2Wins),
          }}>
            {match.score2}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Single-tier bracket diagram with connecting lines ─────────────────────────
function TierDiagram({
  tier,
  filter,
  isDark,
}: {
  tier: Tier
  filter: Extract<ZoneConfig, { type: 'bracket' }>['round_filter']
  isDark: boolean
}) {
  const { matches } = tier

  // Derive unique round numbers from actual data, sorted high → low
  // (high = first/opening round with most matches, 1 = final)
  const allRoundNums = [...new Set(matches.map((m) => m.round_number))].sort((a, b) => b - a)
  const visibleRoundNums = getVisibleRoundNums(allRoundNums, filter)
  if (visibleRoundNums.length === 0) return null

  // Group matches by round and sort by match_number within each round
  const byRound = new Map<number, DisplayBracketMatch[]>()
  for (const r of visibleRoundNums) byRound.set(r, [])
  for (const m of matches) {
    if (byRound.has(m.round_number)) byRound.get(m.round_number)!.push(m)
  }
  for (const [r, ms] of byRound) {
    byRound.set(r, [...ms].sort((a, b) => a.match_number - b.match_number))
  }

  // totalHeight is determined by the first (most-match) round
  const firstRoundCount = (byRound.get(visibleRoundNums[0]) ?? []).length
  const totalH = firstRoundCount * (MATCH_H + MATCH_GAP) - MATCH_GAP

  const numCols = visibleRoundNums.length
  // Each column occupies COL_W + ARM_W on the right (connector arm space).
  // The last column needs no right arm, so total = numCols * COL_W + (numCols - 1) * ARM_W * 2
  const totalW = numCols * COL_W + Math.max(0, numCols - 1) * ARM_W * 2

  const lineColor = isDark ? '#4b5563' : '#9ca3af'

  return (
    <div style={{ position: 'relative', width: totalW }}>
      {/* Round labels */}
      <div style={{ display: 'flex', marginBottom: 6 }}>
        {visibleRoundNums.map((rn) => (
          <div key={rn} style={{ width: COL_W + (ARM_W * 2), flexShrink: 0, textAlign: 'center' }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: isDark ? '#71717a' : '#9ca3af',
            }}>
              {getRoundLabel(rn)}
            </span>
          </div>
        ))}
      </div>

      {/* Match columns — flex row, each column is position:relative */}
      <div style={{ display: 'flex', height: totalH }}>
        {visibleRoundNums.map((roundNum, colIdx) => {
          const roundMatches = byRound.get(roundNum) ?? []
          const matchesInRound = roundMatches.length
          const slotH = totalH / matchesInRound
          const isLastCol = colIdx === numCols - 1

          return (
            <div
              key={roundNum}
              style={{
                width: COL_W + ARM_W * 2,
                flexShrink: 0,
                position: 'relative',
                height: totalH,
              }}
            >
              {roundMatches.map((match, i) => {
                // Centre each match card within its vertical slot
                const top = i * slotH + (slotH - MATCH_H) / 2

                return (
                  <div
                    key={match.id}
                    style={{ position: 'absolute', top, left: ARM_W, right: ARM_W }}
                  >
                    {/* Right horizontal arm — connects this card to the next column's bracket */}
                    {!isLastCol && (
                      <div style={{
                        position: 'absolute',
                        right: -(ARM_W * 2),
                        top: MATCH_H / 2,
                        width: ARM_W * 2,
                        height: 1,
                        backgroundColor: lineColor,
                      }} />
                    )}

                    {/* Left bracket — the ⊏-shaped connector from the previous column.
                        The bracket spans slotH/2 centred on this match's midpoint.
                        This correctly brackets the two predecessor matches whose
                        combined slot height equals slotH. */}
                    {colIdx > 0 && (
                      <div style={{
                        position: 'absolute',
                        left: -(ARM_W * 2),
                        top: MATCH_H / 2 - slotH / 4,
                        width: ARM_W * 2,
                        height: slotH / 2,
                        borderLeft:   `1px solid ${lineColor}`,
                        borderTop:    `1px solid ${lineColor}`,
                        borderBottom: `1px solid ${lineColor}`,
                      }} />
                    )}

                    <MatchCard match={match} isDark={isDark} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main BracketZone ──────────────────────────────────────────────────────────
export function BracketZone({ bracket, config, theme }: Props) {
  const isDark = theme === 'dark'

  // Apply tier_filter if set — lets each zone show a specific tier (e.g. Gold only)
  const activeTiers = (bracket?.tiers ?? []).filter((t) =>
    t.matches.length > 0 &&
    (!config.tier_filter || t.name === config.tier_filter)
  )

  if (activeTiers.length === 0) {
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

  // Only show tier names when there are multiple tiers and at least one has a name
  const showTierNames = activeTiers.length > 1 && activeTiers.some((t) => t.name)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          Bracket
        </h2>
      </div>

      <FitContent>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeTiers.map((tier, i) => (
            <div key={i}>
              {showTierNames && tier.name && (
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 10,
                  color: isDark ? '#a1a1aa' : '#6b7280',
                }}>
                  {tier.name}
                </div>
              )}
              <TierDiagram tier={tier} filter={config.round_filter} isDark={isDark} />
            </div>
          ))}
        </div>
      </FitContent>
    </div>
  )
}
