/**
 * Playoff roster (Phase A).
 *
 * The roster is the admin's answer to two questions standings can't answer:
 * WHO is in the playoff field, and IN WHAT ORDER. It is stored on
 * playoff_configs (`custom_seed_order`, `excluded_team_ids`) and applied by
 * every seeding path, so a hand-built field survives reload, re-seed and
 * regeneration.
 *
 * These helpers are pure — the DB reads live in actions/.
 */

export interface PlayoffRoster {
  /** Ordered team ids. Null/empty = keep standings order. */
  customOrder: string[] | null
  /** Teams sitting out — removed from the field entirely. */
  excluded: string[]
}

export const EMPTY_ROSTER: PlayoffRoster = { customOrder: null, excluded: [] }

/** True when the roster changes anything about the field or its order. */
export function rosterIsActive(roster: PlayoffRoster): boolean {
  return roster.excluded.length > 0 || (roster.customOrder?.length ?? 0) > 0
}

/**
 * Applies the roster to a list already in standings order.
 *
 * - Excluded teams are dropped (everyone below shifts up).
 * - With a custom order, listed teams lead in that order; anything unlisted
 *   (a team added after the order was saved) follows in standings order, so a
 *   stale order degrades gracefully instead of losing teams.
 * - Ids in the order that no longer exist (deleted teams) are ignored.
 */
export function applyRoster<T extends { teamId: string }>(
  standingsOrder: T[],
  roster: PlayoffRoster
): T[] {
  const excluded = new Set(roster.excluded)
  const field = standingsOrder.filter((t) => !excluded.has(t.teamId))
  if (!roster.customOrder || roster.customOrder.length === 0) return field

  const byId = new Map(field.map((t) => [t.teamId, t]))
  const ordered: T[] = []
  const placed = new Set<string>()
  for (const id of roster.customOrder) {
    const team = byId.get(id)
    if (!team || placed.has(id)) continue
    ordered.push(team)
    placed.add(id)
  }
  for (const t of field) {
    if (!placed.has(t.teamId)) ordered.push(t)
  }
  return ordered
}

/**
 * Re-numbers a `seed` field 1..n over the given order. Tier slicing happens
 * before this, so seeds are always tier-local (the DB stores the global seed
 * by adding the tier's offset).
 */
export function renumberSeeds<T extends { teamId: string; seed?: number }>(teams: T[]): T[] {
  return teams.map((t, i) => ({ ...t, seed: i + 1 }))
}

/**
 * Moves a team one place within the visible field.
 *
 * `fullOrder` keeps every team (teams sitting out included) so bringing one
 * back restores its place; `visibleOrder` is the field the admin actually sees.
 * Moving by one therefore hops OVER any sat-out teams in between rather than
 * appearing to do nothing. Returns the input unchanged at the ends.
 */
export function moveInField(
  fullOrder: string[],
  visibleOrder: string[],
  teamId: string,
  delta: number
): string[] {
  const visibleIndex = visibleOrder.indexOf(teamId)
  if (visibleIndex < 0) return fullOrder
  const neighbour = visibleOrder[visibleIndex + delta]
  if (neighbour === undefined) return fullOrder

  const from = fullOrder.indexOf(teamId)
  const to = fullOrder.indexOf(neighbour)
  if (from < 0 || to < 0) return fullOrder

  const next = [...fullOrder]
  next.splice(from, 1)
  next.splice(to, 0, teamId)
  return next
}
