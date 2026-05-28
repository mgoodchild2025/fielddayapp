import type { DisplayBracketMatch, ZoneConfig } from '@/lib/display-types'
import { FitContent } from './fit-content'

type Tier = { name: string | null; matches: DisplayBracketMatch[] }

interface Props {
  bracket:  { tiers: Tier[] } | null
  config:   Extract<ZoneConfig, { type: 'bracket' }>
  theme:    'dark' | 'light'
  timezone: string
}

function fmtMatchTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  }).format(new Date(iso))
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
// When a match has no scores yet and has a scheduled time, the divider between
// the two team rows shows the time (and court if set) instead of a plain line.
// The two team rows shrink to 34 px each, leaving 12 px for the time strip —
// total is still MATCH_H = 80 px.

const TEAM_ROW_H  = 34  // px per team row when time strip is shown
const TIME_STRIP_H = 12 // px for the time/court strip

function MatchCard({
  match,
  isDark,
  timezone,
}: {
  match:    DisplayBracketMatch
  isDark:   boolean
  timezone: string
}) {
  const t1Wins   = match.score1 !== null && match.score2 !== null && match.score1 > match.score2
  const t2Wins   = match.score1 !== null && match.score2 !== null && match.score2 > match.score1
  const hasScore = match.score1 !== null || match.score2 !== null
  const isTbd    = !hasScore && match.team1_name === null && match.team2_name === null

  // Show time strip only when there are no scores and a scheduled time exists
  const showTime = !hasScore && !!match.scheduled_at
  const timeLabel = showTime
    ? [fmtMatchTime(match.scheduled_at!, timezone), match.court].filter(Boolean).join(' · ')
    : null

  const rowH   = showTime ? TEAM_ROW_H : MATCH_H / 2
  const border = isDark ? '#3f3f46' : '#e5e7eb'
  const bg     = isDark ? '#18181b' : '#ffffff'
  const divBg  = isDark ? 'rgba(6,78,59,0.30)' : '#f0fdf4'
  const metaColor = isDark ? '#52525b' : '#9ca3af'

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
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Team 1 row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        height: rowH,
        flexShrink: 0,
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

      {/* Divider — plain line, or time+court strip for unscored matches */}
      {showTime ? (
        <div style={{
          position: 'relative',
          height: TIME_STRIP_H,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {/* Full-width rule */}
          <div style={{ position: 'absolute', inset: '50% 0 auto 0', height: 1, backgroundColor: border }} />
          {/* Time label floats over the rule */}
          <span style={{
            position: 'relative',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: metaColor,
            backgroundColor: bg,
            paddingLeft: 5,
            paddingRight: 5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            maxWidth: '90%',
            textOverflow: 'ellipsis',
          }}>
            {timeLabel}
          </span>
        </div>
      ) : (
        <div style={{ height: 1, flexShrink: 0, backgroundColor: border }} />
      )}

      {/* Team 2 row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        flex: 1,
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
  timezone,
}: {
  tier:     Tier
  filter:   Extract<ZoneConfig, { type: 'bracket' }>['round_filter']
  isDark:   boolean
  timezone: string
}) {
  const { matches } = tier

  // The third place match lives in round 1 with match_number === 2.
  // Separate it out before layout so it doesn't appear in the Final column.
  const thirdPlaceMatch = matches.find((m) => m.round_number === 1 && m.match_number === 2)
  const mainMatches     = matches.filter((m) => !(m.round_number === 1 && m.match_number === 2))

  // Champion: winner of the final (round_number=1, match_number=1)
  const finalMatch = mainMatches.find((m) => m.round_number === 1 && m.match_number === 1)
  const champion = (() => {
    if (!finalMatch || finalMatch.score1 === null || finalMatch.score2 === null) return null
    if (finalMatch.score1 > finalMatch.score2) return finalMatch.team1_name
    if (finalMatch.score2 > finalMatch.score1) return finalMatch.team2_name
    return null
  })()

  // Derive unique round numbers from main matches only, sorted high → low
  const allRoundNums = [...new Set(mainMatches.map((m) => m.round_number))].sort((a, b) => b - a)
  const visibleRoundNums = getVisibleRoundNums(allRoundNums, filter)
  if (visibleRoundNums.length === 0) return null

  // Show third place and champion only when the final round is visible
  const finalVisible = visibleRoundNums.includes(1)

  // Group matches by round and sort by match_number within each round
  const byRound = new Map<number, DisplayBracketMatch[]>()
  for (const r of visibleRoundNums) byRound.set(r, [])
  for (const m of mainMatches) {
    if (byRound.has(m.round_number)) byRound.get(m.round_number)!.push(m)
  }
  for (const [r, ms] of byRound) {
    byRound.set(r, [...ms].sort((a, b) => a.match_number - b.match_number))
  }

  // totalHeight is determined by the first (most-match) round
  const firstRoundCount = (byRound.get(visibleRoundNums[0]) ?? []).length
  const totalH = firstRoundCount * (MATCH_H + MATCH_GAP) - MATCH_GAP

  const numCols = visibleRoundNums.length
  const totalW  = numCols * COL_W + Math.max(0, numCols - 1) * ARM_W * 2

  const lineColor    = isDark ? '#4b5563' : '#9ca3af'
  const subtextColor = isDark ? '#71717a' : '#9ca3af'
  const dividerColor = isDark ? '#3f3f46' : '#e5e7eb'

  return (
    <div>
      {/* ── Round labels ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', marginBottom: 6 }}>
        {visibleRoundNums.map((rn) => (
          <div key={rn} style={{ width: COL_W + ARM_W * 2, flexShrink: 0, textAlign: 'center' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: subtextColor,
            }}>
              {getRoundLabel(rn)}
            </span>
          </div>
        ))}
      </div>

      {/* ── Match columns + champion inline to the right ───────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', height: totalH }}>

        {/* Match columns */}
        <div style={{ display: 'flex', height: totalH, flexShrink: 0 }}>
          {visibleRoundNums.map((roundNum, colIdx) => {
            const roundMatches   = byRound.get(roundNum) ?? []
            const matchesInRound = roundMatches.length
            const slotH          = totalH / matchesInRound
            const isLastCol      = colIdx === numCols - 1

            return (
              <div key={roundNum} style={{ width: COL_W + ARM_W * 2, flexShrink: 0, position: 'relative', height: totalH }}>
                {roundMatches.map((match, i) => {
                  const top = i * slotH + (slotH - MATCH_H) / 2
                  return (
                    <div key={match.id} style={{ position: 'absolute', top, left: ARM_W, right: ARM_W }}>
                      {/* Right arm — between rounds, or connecting final to champion */}
                      {(!isLastCol || (isLastCol && finalVisible && !!champion)) && (
                        <div style={{
                          position: 'absolute', right: -(ARM_W * 2), top: MATCH_H / 2,
                          width: ARM_W * 2, height: 1, backgroundColor: lineColor,
                        }} />
                      )}
                      {/* Left ⊏ bracket */}
                      {colIdx > 0 && (
                        <div style={{
                          position: 'absolute', left: -(ARM_W * 2),
                          top: MATCH_H / 2 - slotH / 4,
                          width: ARM_W * 2, height: slotH / 2,
                          borderLeft: `1px solid ${lineColor}`,
                          borderTop:  `1px solid ${lineColor}`,
                          borderBottom: `1px solid ${lineColor}`,
                        }} />
                      )}
                      <MatchCard match={match} isDark={isDark} timezone={timezone} />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Champion — vertically centered with final match, connected by arm line */}
        {finalVisible && champion && (
          <div style={{
            paddingLeft: ARM_W * 2 + 12,  // clears the arm line + breathing room
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: subtextColor, marginBottom: 5,
            }}>
              Champion
            </div>
            <div style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#f59e0b',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}>
              🏆 {champion}
            </div>
          </div>
        )}

      </div>

      {/* ── Third place match ──────────────────────────────────────────────── */}
      {finalVisible && thirdPlaceMatch && (
        <div style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: `1px solid ${dividerColor}`,
          maxWidth: COL_W + ARM_W * 2,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: subtextColor, marginBottom: 6,
            paddingLeft: ARM_W,
          }}>
            Third Place
          </div>
          <div style={{ paddingLeft: ARM_W, paddingRight: ARM_W }}>
            <MatchCard match={thirdPlaceMatch} isDark={isDark} timezone={timezone} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main BracketZone ──────────────────────────────────────────────────────────
export function BracketZone({ bracket, config, theme, timezone }: Props) {
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

  // Show tier name above each diagram whenever the tier has a name
  const showTierNames = activeTiers.some((t) => t.name)

  // Zone header: use tier name when a filter is active, otherwise generic "Bracket"
  const headerText = config.tier_filter ? `${config.tier_filter} Bracket` : 'Bracket'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          {headerText}
        </h2>
      </div>

      <FitContent>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeTiers.map((tier, i) => (
            <div key={i}>
              {showTierNames && tier.name && (
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 10,
                  color: isDark ? '#d4d4d8' : '#374151',
                }}>
                  {tier.name}
                </div>
              )}
              <TierDiagram tier={tier} filter={config.round_filter} isDark={isDark} timezone={timezone} />
            </div>
          ))}
        </div>
      </FitContent>
    </div>
  )
}
