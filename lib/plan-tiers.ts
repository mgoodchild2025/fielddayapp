/** Plan tier ordering + labels (shared by billing UI + server actions). */

export type PaidTier = 'starter' | 'pro' | 'club'
export type PlanTier = 'free' | PaidTier | 'internal'

export const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  club: 3,
  internal: 4,
}

export const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  club: 'Club',
  internal: 'Internal',
}

export function tierLabel(tier: string | null | undefined): string {
  return tier ? (TIER_LABEL[tier] ?? tier) : '—'
}

export function isUpgrade(from: string, to: string): boolean {
  return (TIER_RANK[to] ?? 0) > (TIER_RANK[from] ?? 0)
}

export function isDowngrade(from: string, to: string): boolean {
  return (TIER_RANK[to] ?? 0) < (TIER_RANK[from] ?? 0)
}
