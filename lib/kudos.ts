/**
 * Kudos: fixed compliments a player gives a teammate or an opponent after a
 * game. Pure; tested in kudos.test.ts. Writes are in actions/kudos.ts.
 */

export const KUDOS_KINDS = [
  { kind: 'great_play', emoji: '💥', label: 'Great play' },
  { kind: 'hustle', emoji: '🏃', label: 'Hustle' },
  { kind: 'good_sport', emoji: '🤝', label: 'Good sport' },
  { kind: 'teammate', emoji: '🙌', label: 'Great teammate' },
  { kind: 'clutch', emoji: '🧊', label: 'Clutch' },
  { kind: 'leader', emoji: '📣', label: 'Leader' },
] as const

export type KudosKind = (typeof KUDOS_KINDS)[number]['kind']

export function isKudosKind(v: unknown): v is KudosKind {
  return KUDOS_KINDS.some((k) => k.kind === v)
}

export function kudosMeta(kind: string): { emoji: string; label: string } {
  return KUDOS_KINDS.find((k) => k.kind === kind) ?? { emoji: '👏', label: 'Kudos' }
}

/** Kudos open when the game starts and close 3 days later. */
export const KUDOS_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export function kudosOpen(scheduledAt: string | null, status: string | null, nowMs: number): boolean {
  if (!scheduledAt || status === 'cancelled' || status === 'postponed') return false
  const t = new Date(scheduledAt).getTime()
  return Number.isFinite(t) && nowMs >= t && nowMs - t <= KUDOS_WINDOW_MS
}

/** Counts by kind, most first (ties in list order). */
export function summarizeKudos(kinds: string[]): { kind: string; emoji: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1)
  const order = (k: string) => { const i = KUDOS_KINDS.findIndex((x) => x.kind === k); return i < 0 ? 99 : i }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))
    .map(([kind, count]) => ({ kind, count, ...kudosMeta(kind) }))
}

/** The receiver's alert: "Sam L. gave you kudos: 💥 Great play". */
export function kudosAlert(giverShortName: string, kind: string, opponent: boolean): { title: string; body: string } {
  const m = kudosMeta(kind)
  return {
    title: `${giverShortName} gave you kudos: ${m.emoji} ${m.label}`,
    body: opponent ? 'From the other team. That is some respect 👏' : 'From a teammate 👏',
  }
}
