/**
 * Matching a typed team name (a CSV schedule, a placeholder slot) to a real
 * team. Spreadsheets and phones swap straight quotes for curly ones and leave
 * stray spaces, so "Hits Don’t Lie " must still find "Hits Don't Lie" — an
 * exact compare left those games unlinked: the schedule showed the typed
 * name, while Courtside, standings and captains saw no team at all.
 */

/** Case-, space-, quote- and dash-insensitive form of a team name. */
export function normalizeTeamName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKC')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The one team a label names, or null. Null when no team matches, or when two
 * teams normalise to the same name (we'd be guessing).
 */
export function findTeamByName<T extends { id: string; name: string }>(label: string | null | undefined, teams: T[]): T | null {
  const key = normalizeTeamName(label)
  if (!key) return null
  const hits = teams.filter((t) => normalizeTeamName(t.name) === key)
  return hits.length === 1 ? hits[0] : null
}
