/**
 * Season Wrapped: a player's own summary of one event once it's completed —
 * the numbers worth being proud of, shown as tiles on /wrapped/<slug> and on a
 * shareable story image. Pure assembly; tested in season-wrapped.test.ts.
 * Loading lives in lib/season-wrapped-load.ts.
 *
 * Only what's worth celebrating shows: a tile with a zero is dropped (nobody
 * shares "0 drop-ins"), and the record line never leads with losses.
 */

export interface WrappedGame {
  at: string | null
  my: number
  their: number
  opponent: string
}

export interface WrappedInputs {
  /** True for set sports: scores are sets won, so the tile says "Sets won". */
  setSport: boolean
  /** The team's confirmed regular games (playoff bracket matches separately). */
  games: WrappedGame[]
  /** Playoff bracket matches the team completed: won or not. */
  playoffs: { won: boolean }[]
  medal: { placement: 'gold' | 'silver' | 'bronze' | 'tier_champion'; label: string } | null
  sessions: number
  teammates: number
  photos: number
}

export interface WrappedTile {
  key: string
  value: string
  label: string
  /** A short line under the value ("vs Net Results"). */
  sub?: string
}

export interface SeasonWrapped {
  played: number
  wins: number
  losses: number
  ties: number
  bestStreak: number
  tiles: WrappedTile[]
  /** The big line at the top: "Champions!", "What a season", … */
  headline: string
  medalGlyph: string | null
}

const GLYPH = { gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆' } as const

export function buildWrapped(i: WrappedInputs): SeasonWrapped {
  const games = [...i.games].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
  let wins = 0, losses = 0, ties = 0, run = 0, bestStreak = 0, pointsFor = 0
  let biggest: { margin: number; game: WrappedGame } | null = null
  for (const g of games) {
    pointsFor += g.my
    if (g.my > g.their) {
      wins++; run++; bestStreak = Math.max(bestStreak, run)
      const margin = g.my - g.their
      if (!biggest || margin > biggest.margin) biggest = { margin, game: g }
    } else {
      run = 0
      if (g.my < g.their) losses++; else ties++
    }
  }
  const played = games.length
  const playoffWins = i.playoffs.filter((p) => p.won).length

  const tiles: WrappedTile[] = []
  if (played > 0) tiles.push({ key: 'played', value: String(played), label: played === 1 ? 'Game played' : 'Games played' })
  if (wins > 0) {
    tiles.push({
      key: 'record',
      value: ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      label: 'Record',
    })
  }
  if (bestStreak >= 2) tiles.push({ key: 'streak', value: String(bestStreak), label: 'Wins in a row' })
  if (pointsFor > 0) tiles.push({ key: 'points', value: String(pointsFor), label: i.setSport ? 'Sets won' : 'Points scored' })
  if (biggest && biggest.margin > 0) {
    tiles.push({
      key: 'biggest',
      value: `${biggest.game.my}–${biggest.game.their}`,
      label: 'Biggest win',
      sub: `vs ${biggest.game.opponent}`,
    })
  }
  if (i.playoffs.length > 0 && playoffWins > 0) {
    tiles.push({ key: 'playoffs', value: `${playoffWins}`, label: playoffWins === 1 ? 'Playoff win' : 'Playoff wins' })
  }
  if (i.sessions > 0) tiles.push({ key: 'sessions', value: String(i.sessions), label: i.sessions === 1 ? 'Drop-in' : 'Drop-ins' })
  if (i.teammates > 0) tiles.push({ key: 'teammates', value: String(i.teammates), label: i.teammates === 1 ? 'Teammate' : 'Teammates' })
  if (i.photos > 0) tiles.push({ key: 'photos', value: String(i.photos), label: i.photos === 1 ? 'Photo shared' : 'Photos shared' })

  const headline =
    i.medal?.placement === 'gold' ? 'Champions!'
    : i.medal ? `${i.medal.label}!`
    : bestStreak >= 3 ? 'On fire this season'
    : played > 0 && wins / played >= 0.6 ? 'What a season'
    : i.sessions >= 5 ? 'You kept showing up'
    : 'Thanks for playing'

  return {
    played, wins, losses, ties, bestStreak, tiles, headline,
    medalGlyph: i.medal ? GLYPH[i.medal.placement] : null,
  }
}

/** Wrapped exists only once an event is over. */
export function isWrappable(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'archived'
}
