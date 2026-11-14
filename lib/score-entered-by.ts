/**
 * "Entered by Sam Lee · 10:42 AM" — who put a score in, for the organisers'
 * screens (Courtside, Scorekeeping, admin schedule). Pure; tested.
 *
 * game_results: a captain's submission is `submitted_by` (pending); whoever
 * confirms it — the other captain, or an admin/scorekeeper saving it — is
 * `confirmed_by`. An admin save writes both as themselves.
 * bracket_matches: `scored_by` / `scored_at` (migration 204).
 */
export type ScorerNames = Map<string, string>

function clock(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(d)
}

const withTime = (text: string, at: string | null) => (at ? `${text} · ${at}` : text)

export function gameEnteredBy(
  result: {
    status: string
    submitted_by?: string | null
    submitted_at?: string | null
    confirmed_by?: string | null
    confirmed_at?: string | null
  } | null,
  names: ScorerNames,
  tz: string,
): string | null {
  if (!result) return null
  const submitter = result.submitted_by ? names.get(result.submitted_by) ?? null : null
  const confirmer = result.confirmed_by ? names.get(result.confirmed_by) ?? null : null
  if (result.status === 'pending') {
    return submitter ? withTime(`Submitted by ${submitter}`, clock(result.submitted_at, tz)) : null
  }
  const at = clock(result.confirmed_at ?? result.submitted_at, tz)
  if (submitter && confirmer && result.submitted_by !== result.confirmed_by) {
    return withTime(`Submitted by ${submitter}, confirmed by ${confirmer}`, at)
  }
  const who = confirmer ?? submitter
  return who ? withTime(`Entered by ${who}`, at) : null
}

export function matchEnteredBy(
  match: { scored_by?: string | null; scored_at?: string | null },
  names: ScorerNames,
  tz: string,
): string | null {
  const who = match.scored_by ? names.get(match.scored_by) ?? null : null
  return who ? withTime(`Entered by ${who}`, clock(match.scored_at, tz)) : null
}

/** The profile name to show; falls back to the email's local part, never the full address. */
export function scorerDisplayName(p: { full_name?: string | null; email?: string | null }): string {
  const name = p.full_name?.trim()
  if (name) return name
  const local = p.email?.split('@')[0]?.trim()
  return local || 'someone'
}
