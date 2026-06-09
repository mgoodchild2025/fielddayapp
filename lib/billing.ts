/**
 * lib/billing.ts — Subscription enforcement helpers
 *
 * Implements the frozen-league + player-cap enforcement system with grace period.
 *
 * How it works:
 * 1. When an org is over their plan limits (league count or player count), the
 *    first enforcement check starts a 14-day grace period by writing grace_ends_at
 *    to the subscriptions table. During grace, all data is accessible with a warning.
 * 2. After grace expires:
 *    - Leagues beyond the plan cap are "frozen" (read-only; oldest N leagues protected)
 *    - New player registrations are blocked
 * 3. Upgrading the plan or archiving leagues brings the org back within limits.
 *    The grace_ends_at is cleared when the org comes back into compliance.
 */

import { createServiceRoleClient } from '@/lib/supabase/service'
import { getLimit } from '@/lib/features'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnforcementState {
  /** Org has more active leagues than their plan allows */
  overLeagueLimit: boolean
  /** Org has more active players than their plan allows */
  overPlayerLimit: boolean
  /** Currently within the 14-day grace window (enforcement not yet active) */
  inGracePeriod: boolean
  /** When the grace period ends (null if within limits) */
  graceEndsAt: Date | null
  /** Days remaining in grace (null if not in grace, 0 if expired) */
  graceDaysLeft: number | null
  /**
   * League IDs that are frozen (read-only). Empty if grace is active or org
   * is within limits. Oldest N leagues are "protected"; newer ones beyond
   * the cap are frozen.
   */
  frozenLeagueIds: string[]
  /**
   * League IDs that would be frozen once grace expires (the "at risk" set).
   * Populated during the grace period so the UI can show targeted warnings.
   * Same as frozenLeagueIds when grace has expired.
   */
  atRiskLeagueIds: string[]
  /**
   * True when org is over player cap AND grace has expired. New registrations
   * are blocked until the org upgrades or removes players.
   */
  playerRegistrationBlocked: boolean
}

// ── Simple in-process cache (30s TTL — shorter than feature config cache) ────

const cache = new Map<string, { value: EnforcementState; ts: number }>()
const CACHE_TTL = 30_000

export function invalidateBillingCache(orgId: string): void {
  cache.delete(orgId)
}

// ── Core enforcement computation ──────────────────────────────────────────────

async function _computeState(orgId: string): Promise<EnforcementState> {
  const db = createServiceRoleClient()
  const now = new Date()

  // Load plan limits + subscription row in parallel
  const [leagueLimit, playerLimit, { data: sub }] = await Promise.all([
    getLimit(orgId, 'max_leagues'),
    getLimit(orgId, 'max_players'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('subscriptions')
      .select('grace_ends_at')
      .eq('organization_id', orgId)
      .single() as Promise<{ data: { grace_ends_at: string | null } | null }>,
  ])

  const empty: EnforcementState = {
    overLeagueLimit: false,
    overPlayerLimit: false,
    inGracePeriod: false,
    graceEndsAt: null,
    graceDaysLeft: null,
    frozenLeagueIds: [],
    atRiskLeagueIds: [],
    playerRegistrationBlocked: false,
  }

  // Unlimited on both axes → no enforcement
  if (leagueLimit === null && playerLimit === null) return empty

  // Fetch active league list + player count conditionally
  const [leagueResult, playerResult] = await Promise.all([
    leagueLimit !== null
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)
          .from('leagues')
          .select('id, created_at')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .in('status', ['registration_open', 'active'])
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; created_at: string }[] }),
    playerLimit !== null
      ? db
          .from('org_members')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('role', 'player')
          .eq('status', 'active')
      : Promise.resolve({ count: 0 as number | null }),
  ])

  const leagues = (leagueResult.data ?? []) as { id: string; created_at: string }[]
  const playerCount = (playerResult as { count: number | null }).count ?? 0

  const overLeagueLimit = leagueLimit !== null && leagues.length > leagueLimit
  const overPlayerLimit = playerLimit !== null && playerCount > playerLimit
  const overLimit = overLeagueLimit || overPlayerLimit

  // Within all limits → clear any stale grace period and return clean state
  if (!overLimit) {
    // If there was an active grace period before, clear it (org came back into compliance)
    if (sub?.grace_ends_at) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from('subscriptions')
        .update({ grace_ends_at: null })
        .eq('organization_id', orgId)
    }
    return { ...empty }
  }

  // Over limit — handle grace period
  let graceEndsAt: Date | null = sub?.grace_ends_at ? new Date(sub.grace_ends_at) : null

  if (!graceEndsAt) {
    // First time over-limit: start the 14-day grace window
    graceEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from('subscriptions')
      .update({ grace_ends_at: graceEndsAt.toISOString() })
      .eq('organization_id', orgId)
  }

  const inGracePeriod = graceEndsAt > now
  const graceDaysLeft = inGracePeriod
    ? Math.ceil((graceEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0

  // Compute which leagues are (or would be) beyond the plan cap
  // atRiskLeagueIds: leagues that would freeze when grace expires
  // frozenLeagueIds: leagues that are actively frozen (grace expired)
  let atRiskLeagueIds: string[] = []
  let frozenLeagueIds: string[] = []

  if (overLeagueLimit && leagueLimit !== null) {
    // Oldest N leagues are "protected"; newer leagues beyond the cap are at risk / frozen
    atRiskLeagueIds = leagues.slice(leagueLimit).map((l) => l.id)
    if (!inGracePeriod) {
      frozenLeagueIds = atRiskLeagueIds
    }
  }

  const playerRegistrationBlocked = !inGracePeriod && overPlayerLimit

  return {
    overLeagueLimit,
    overPlayerLimit,
    inGracePeriod,
    graceEndsAt,
    graceDaysLeft,
    frozenLeagueIds,
    atRiskLeagueIds,
    playerRegistrationBlocked,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Full enforcement state for an org (cached for 30s). */
export async function getEnforcementState(orgId: string): Promise<EnforcementState> {
  const hit = cache.get(orgId)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.value
  const value = await _computeState(orgId)
  cache.set(orgId, { value, ts: Date.now() })
  return value
}

/**
 * Returns true when the specified league is frozen (read-only).
 * Frozen leagues are those beyond the plan's league cap after the grace period expires.
 * The oldest N leagues (where N = plan limit) remain active; newer ones are frozen.
 */
export async function isLeagueFrozen(leagueId: string, orgId: string): Promise<boolean> {
  const state = await getEnforcementState(orgId)
  return state.frozenLeagueIds.includes(leagueId)
}

/**
 * Returns true when new player registrations should be blocked for this org.
 * Triggered when the org exceeds their plan's player cap AND the grace period has expired.
 */
export async function isPlayerRegistrationBlocked(orgId: string): Promise<boolean> {
  const state = await getEnforcementState(orgId)
  return state.playerRegistrationBlocked
}

/**
 * Returns true when the org is currently in the 14-day grace window.
 * During grace, all features remain accessible but a warning banner is shown.
 */
export async function isInGracePeriod(orgId: string): Promise<boolean> {
  const state = await getEnforcementState(orgId)
  return state.inGracePeriod
}

/**
 * Returns the IDs of leagues that are currently active/open but beyond the plan cap.
 * These leagues are frozen (read-only) when the grace period has expired.
 * Returns an empty array if within cap or still in grace period.
 */
export async function getActiveLimitedLeagueIds(orgId: string): Promise<string[]> {
  const state = await getEnforcementState(orgId)
  return state.frozenLeagueIds
}
