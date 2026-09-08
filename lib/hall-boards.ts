/**
 * Honour-roll arithmetic for the Hall of Champions — pure, tested. The loader
 * (lib/hall-of-champions.ts) fetches; these decide who is recognised for what.
 *
 * Medals are awarded to whole rosters, so raw medal counts mostly reflect team
 * results and tie a dozen ways. The boards here either show ties honestly
 * (tally tiers) or reward things that distinguish individuals (titles across
 * different events, seasons played, career stats).
 */

export interface MedalRecipientRow {
  medalId: string
  leagueId: string
  placement: string      // gold | silver | bronze | tier_champion
  year: string
  userId: string | null
  name: string
}

export interface PlayerRef { userId: string | null; name: string }

// ── Most decorated: tally tiers ─────────────────────────────────────────────

export interface DecoratedTier {
  gold: number
  silver: number
  bronze: number
  tierTitles: number
  /** 🥇-weighted ordering score. */
  score: number
  players: PlayerRef[]
}

function playerKey(r: { userId: string | null; name: string }): string {
  return r.userId ?? `name:${r.name.toLowerCase()}`
}

/** Groups players by identical medal tally, best tally first; names A–Z within a tier. */
export function decoratedTiers(rows: MedalRecipientRow[]): DecoratedTier[] {
  const tally = new Map<string, DecoratedTier & { ref: PlayerRef }>()
  for (const r of rows) {
    const key = playerKey(r)
    const t = tally.get(key) ?? { gold: 0, silver: 0, bronze: 0, tierTitles: 0, score: 0, players: [], ref: { userId: r.userId, name: r.name } }
    if (r.placement === 'gold') { t.gold++; t.score += 1000 }
    else if (r.placement === 'silver') { t.silver++; t.score += 100 }
    else if (r.placement === 'bronze') { t.bronze++; t.score += 10 }
    else { t.tierTitles++; t.score += 1 }
    tally.set(key, t)
  }
  const tiers = new Map<string, DecoratedTier>()
  for (const t of tally.values()) {
    const k = `${t.gold}:${t.silver}:${t.bronze}:${t.tierTitles}`
    const tier = tiers.get(k) ?? { gold: t.gold, silver: t.silver, bronze: t.bronze, tierTitles: t.tierTitles, score: t.score, players: [] }
    tier.players.push(t.ref)
    tiers.set(k, tier)
  }
  return [...tiers.values()]
    .map((t) => ({ ...t, players: t.players.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.score - a.score)
}

/** "🥇2 🥈 🏆" — the shelf string for a tally. */
export function tallyShelf(t: { gold: number; silver: number; bronze: number; tierTitles: number }): string {
  return [
    t.gold > 0 && `🥇${t.gold > 1 ? t.gold : ''}`,
    t.silver > 0 && `🥈${t.silver > 1 ? t.silver : ''}`,
    t.bronze > 0 && `🥉${t.bronze > 1 ? t.bronze : ''}`,
    t.tierTitles > 0 && `🏆${t.tierTitles > 1 ? t.tierTitles : ''}`,
  ].filter(Boolean).join(' ')
}

// ── Repeat champions: gold in two or more DIFFERENT events ──────────────────

export interface RepeatChampion extends PlayerRef {
  titles: number
  years: string[]
}

export function repeatChampions(rows: MedalRecipientRow[]): RepeatChampion[] {
  const byPlayer = new Map<string, RepeatChampion & { leagues: Set<string> }>()
  for (const r of rows) {
    if (r.placement !== 'gold') continue
    const key = playerKey(r)
    const p = byPlayer.get(key) ?? { userId: r.userId, name: r.name, titles: 0, years: [], leagues: new Set<string>() }
    if (!p.leagues.has(r.leagueId)) {
      p.leagues.add(r.leagueId)
      p.years.push(r.year)
    }
    byPlayer.set(key, p)
  }
  return [...byPlayer.values()]
    .filter((p) => p.leagues.size >= 2)
    .map(({ leagues, ...p }) => ({ ...p, titles: leagues.size, years: [...new Set(p.years)].sort() }))
    .sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name))
}

// ── Most seasons: distinct events played, grouped by count ──────────────────

export interface TenureTier { seasons: number; players: PlayerRef[] }

export function tenureTiers(
  memberships: { userId: string; name: string; leagueId: string }[],
  opts: { minSeasons?: number; maxTiers?: number } = {},
): TenureTier[] {
  const { minSeasons = 2, maxTiers = 3 } = opts
  const byPlayer = new Map<string, { ref: PlayerRef; leagues: Set<string> }>()
  for (const m of memberships) {
    const p = byPlayer.get(m.userId) ?? { ref: { userId: m.userId, name: m.name }, leagues: new Set<string>() }
    p.leagues.add(m.leagueId)
    byPlayer.set(m.userId, p)
  }
  const tiers = new Map<number, PlayerRef[]>()
  for (const p of byPlayer.values()) {
    if (p.leagues.size < minSeasons) continue
    const list = tiers.get(p.leagues.size) ?? []
    list.push(p.ref)
    tiers.set(p.leagues.size, list)
  }
  return [...tiers.entries()]
    .sort(([a], [b]) => b - a)
    .slice(0, maxTiers)
    .map(([seasons, players]) => ({ seasons, players: players.sort((a, b) => a.name.localeCompare(b.name)) }))
}

// ── Stat leaders: career total of a sport's headline stat ───────────────────

export interface StatLeaderBoard {
  sport: string
  statKey: string
  statLabel: string
  players: (PlayerRef & { value: number })[]
}

export function statLeaders(
  stats: { userId: string; name: string; sport: string; statKey: string; value: number }[],
  headline: Map<string, { key: string; label: string }>,   // sport → its first stat definition
  top = 5,
): StatLeaderBoard[] {
  const boards = new Map<string, StatLeaderBoard & { totals: Map<string, PlayerRef & { value: number }> }>()
  for (const s of stats) {
    const def = headline.get(s.sport)
    if (!def || s.statKey !== def.key) continue
    const board = boards.get(s.sport) ?? { sport: s.sport, statKey: def.key, statLabel: def.label, players: [], totals: new Map() }
    const row = board.totals.get(s.userId) ?? { userId: s.userId, name: s.name, value: 0 }
    row.value += s.value
    board.totals.set(s.userId, row)
    boards.set(s.sport, board)
  }
  return [...boards.values()]
    .map(({ totals, ...b }) => ({
      ...b,
      players: [...totals.values()].filter((p) => p.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, top),
    }))
    .filter((b) => b.players.length > 0)
    .sort((a, b) => a.sport.localeCompare(b.sport))
}
