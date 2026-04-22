import { createServiceRoleClient } from '@/lib/supabase/service'

export type Feature =
  | 'multiple_leagues'
  | 'unlimited_players'
  | 'custom_domain'
  | 'full_branding'
  | 'discount_codes'
  | 'payment_plans'
  | 'email_broadcasts'
  | 'white_label_email'
  | 'priority_support'
  | 'waived_transaction_fee'

const TIER_FEATURES: Record<string, Feature[]> = {
  internal: [
    'multiple_leagues', 'unlimited_players', 'custom_domain', 'full_branding',
    'discount_codes', 'payment_plans', 'email_broadcasts', 'white_label_email',
    'priority_support', 'waived_transaction_fee',
  ],
  club: [
    'multiple_leagues', 'unlimited_players', 'custom_domain', 'full_branding',
    'discount_codes', 'payment_plans', 'email_broadcasts', 'white_label_email',
    'priority_support', 'waived_transaction_fee',
  ],
  pro: [
    'multiple_leagues', 'unlimited_players', 'custom_domain', 'full_branding',
    'discount_codes', 'payment_plans', 'email_broadcasts',
  ],
  starter: [],
}

export const PLATFORM_FEE_BPS: Record<string, number> = {
  internal: 0,
  club: 0,
  pro: 100,
  starter: 200,
}

export const PLAYER_CAPS: Record<string, number> = {
  internal: Infinity,
  club: Infinity,
  pro: 1000,
  starter: 100,
}

export const LEAGUE_CAPS: Record<string, number> = {
  internal: Infinity,
  club: Infinity,
  pro: Infinity,
  starter: 1,
}

async function getOrgSubscription(orgId: string) {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_tier, status')
    .eq('organization_id', orgId)
    .single()
  return data
}

export async function canAccess(orgId: string, feature: Feature): Promise<boolean> {
  const sub = await getOrgSubscription(orgId)
  if (!sub || sub.status === 'canceled') return false
  if (sub.status === 'past_due') return false
  const tier = sub.plan_tier ?? 'starter'
  return TIER_FEATURES[tier]?.includes(feature) ?? false
}

export async function getPlatformFeeBps(orgId: string): Promise<number> {
  const sub = await getOrgSubscription(orgId)
  const tier = sub?.plan_tier ?? 'starter'
  return PLATFORM_FEE_BPS[tier] ?? 200
}

export async function getActiveLeagueCount(orgId: string): Promise<number> {
  const supabase = createServiceRoleClient()
  const { count } = await supabase
    .from('leagues')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['registration_open', 'active'])
  return count ?? 0
}
