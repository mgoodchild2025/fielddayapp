/**
 * Team fee status for per-team events — the one answer to "has this team paid?".
 *
 * In per_team leagues the fee is carried by a payments row keyed by team_id
 * with registration_id NULL, so any check that looks at a person's own
 * registration payment will miss it. That mismatch is why a captain joining a
 * team an admin had already marked paid was still sent to the payment step.
 *
 * Used by: the register-flow gates (server + client), the admin Teams tab
 * badge/warning, and the registrations screen's Payment column.
 */

export type TeamPaymentState = 'paid' | 'pending' | 'none'

export interface TeamPaymentInfo {
  state: TeamPaymentState
  amountCents: number | null
  currency: string | null
}

export interface TeamPaymentRowLite {
  team_id: string | null
  status: string | null
  amount_cents?: number | null
  currency?: string | null
}

/** 'manual' is an offline payment an admin acknowledged — as settled as 'paid'. */
export function isPaidStatus(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'manual'
}

export const NO_TEAM_PAYMENT: TeamPaymentInfo = { state: 'none', amountCents: null, currency: null }

/**
 * Index payment rows by team. A paid row always wins over a pending one — an
 * admin who records cash against a team that also has a pending online attempt
 * has settled the fee.
 */
export function indexTeamPayments(rows: TeamPaymentRowLite[]): Map<string, TeamPaymentInfo> {
  const byTeam = new Map<string, TeamPaymentInfo>()
  for (const row of rows) {
    if (!row.team_id) continue
    const info: TeamPaymentInfo = {
      state: isPaidStatus(row.status) ? 'paid' : row.status === 'pending' ? 'pending' : 'none',
      amountCents: row.amount_cents ?? null,
      currency: row.currency ?? null,
    }
    const prev = byTeam.get(row.team_id)
    if (!prev || (info.state === 'paid' && prev.state !== 'paid')) byTeam.set(row.team_id, info)
  }
  return byTeam
}

export function teamHasPaid(info: TeamPaymentInfo | undefined | null): boolean {
  return info?.state === 'paid'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Team fee status for every team in a league (or just the ids given). */
export async function getTeamPaymentInfo(
  db: Db,
  orgId: string,
  leagueId: string,
  teamIds?: string[],
): Promise<Map<string, TeamPaymentInfo>> {
  if (teamIds && teamIds.length === 0) return new Map()
  let query = db
    .from('payments')
    .select('team_id, status, amount_cents, currency')
    .eq('organization_id', orgId)
    .eq('league_id', leagueId)
    .eq('payment_type', 'team')
  if (teamIds) query = query.in('team_id', teamIds)
  const { data } = await query
  return indexTeamPayments((data ?? []) as TeamPaymentRowLite[])
}

/** Has this one team settled its fee? Cheap enough to call on a single team. */
export async function hasTeamPaid(db: Db, orgId: string, leagueId: string, teamId: string): Promise<boolean> {
  const map = await getTeamPaymentInfo(db, orgId, leagueId, [teamId])
  return teamHasPaid(map.get(teamId))
}
