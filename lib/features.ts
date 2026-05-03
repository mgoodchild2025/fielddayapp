import { createServiceRoleClient } from '@/lib/supabase/service'

// ── Feature types ─────────────────────────────────────────────────────────────

export type BooleanFeature =
  | 'sms_notifications'
  | 'discount_codes'
  | 'double_elimination'
  | 'pools_divisions'
  | 'drop_in_sessions'
  | 'recurring_sessions'
  | 'payment_plans'
  | 'early_bird_pricing'
  | 'custom_domain'
  | 'csv_import'
  | 'print_scoresheets'
  | 'stats_leaderboards'
  | 'co_organizers'
  | 'event_rules_templates'
  | 'custom_positions'
  | 'favicon'

export type LimitFeature =
  | 'max_leagues'   // null = unlimited
  | 'max_players'   // null = unlimited

export type Feature = BooleanFeature | LimitFeature

// ── Feature metadata (used by the admin UI) ───────────────────────────────────

export type FeatureGroup = {
  label: string
  features: Array<{
    key: Feature
    label: string
    description: string
    type: 'boolean' | 'limit'
    unit?: string   // e.g. 'leagues', 'players', 'bps'
  }>
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: 'Plan Limits',
    features: [
      { key: 'max_leagues', label: 'Max active leagues', description: 'Maximum number of leagues in registration_open or active status', type: 'limit', unit: 'leagues' },
      { key: 'max_players', label: 'Max players',        description: 'Maximum org_members with player role', type: 'limit', unit: 'players' },
    ],
  },
  {
    label: 'Scheduling',
    features: [
      { key: 'double_elimination',    label: 'Double elimination brackets', description: 'Create double-elimination tournament brackets', type: 'boolean' },
      { key: 'pools_divisions',       label: 'Pools & divisions',           description: 'Organise teams into pools and divisions', type: 'boolean' },
      { key: 'csv_import',            label: 'CSV schedule import',         description: 'Import game schedules from a CSV file', type: 'boolean' },
      { key: 'print_scoresheets',     label: 'Print scoresheets',           description: 'Generate print-ready score and stat sheets', type: 'boolean' },
    ],
  },
  {
    label: 'Registration & Payments',
    features: [
      { key: 'early_bird_pricing',    label: 'Early bird pricing',    description: 'Set a discounted early registration price with deadline', type: 'boolean' },
      { key: 'discount_codes',        label: 'Discount / promo codes', description: 'Create and manage promotional discount codes', type: 'boolean' },
      { key: 'payment_plans',         label: 'Payment plans',          description: 'Allow players to pay in instalments', type: 'boolean' },
    ],
  },
  {
    label: 'Sessions & Drop-ins',
    features: [
      { key: 'drop_in_sessions',   label: 'Drop-in events',       description: 'Create single-session drop-in events with per-session pricing', type: 'boolean' },
      { key: 'recurring_sessions', label: 'Recurring sessions',   description: 'Create repeating game sessions', type: 'boolean' },
    ],
  },
  {
    label: 'Stats & Comms',
    features: [
      { key: 'stats_leaderboards', label: 'Stats & leaderboards',  description: 'Custom stat definitions, per-game entry, and season leaderboards', type: 'boolean' },
      { key: 'sms_notifications',  label: 'SMS notifications',     description: 'Send SMS reminders and alerts to players', type: 'boolean' },
    ],
  },
  {
    label: 'Customisation',
    features: [
      { key: 'co_organizers',         label: 'Co-organizer accounts',    description: 'Invite users with league_admin role', type: 'boolean' },
      { key: 'event_rules_templates', label: 'Event rules templates',    description: 'Save and reuse event rules across leagues', type: 'boolean' },
      { key: 'custom_positions',      label: 'Custom sport positions',   description: 'Define custom player positions per sport', type: 'boolean' },
      { key: 'favicon',               label: 'Custom favicon',           description: 'Upload a custom browser favicon', type: 'boolean' },
      { key: 'custom_domain',         label: 'Custom domain',            description: 'Serve the org site from a custom domain name', type: 'boolean' },
    ],
  },
]

// ── Simple in-memory cache (60s TTL) ─────────────────────────────────────────

type PlanConfigRow = { tier: string; feature: string; enabled: boolean; limit_value: number | null }
type OverrideRow   = { feature: string; enabled: boolean; limit_value: number | null }

let configCache: PlanConfigRow[] | null = null
let configCacheTs = 0
const CONFIG_TTL = 60_000

async function loadPlanConfigs(): Promise<PlanConfigRow[]> {
  if (configCache && Date.now() - configCacheTs < CONFIG_TTL) return configCache
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('plan_configs').select('tier, feature, enabled, limit_value')
  configCache = (data ?? []) as PlanConfigRow[]
  configCacheTs = Date.now()
  return configCache
}

export function invalidatePlanConfigCache() {
  configCache = null
}

// ── Subscription helpers ──────────────────────────────────────────────────────

async function getOrgTier(orgId: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_tier, status')
    .eq('organization_id', orgId)
    .single()
  if (!data || data.status === 'canceled' || data.status === 'past_due') return 'suspended'
  return data.plan_tier ?? 'starter'
}

async function getOrgOverrides(orgId: string): Promise<OverrideRow[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('org_feature_overrides')
    .select('feature, enabled, limit_value')
    .eq('organization_id', orgId)
  return (data ?? []) as OverrideRow[]
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if the org's plan includes the given boolean feature. */
export async function canAccess(orgId: string, feature: BooleanFeature): Promise<boolean> {
  const [tier, configs, overrides] = await Promise.all([
    getOrgTier(orgId),
    loadPlanConfigs(),
    getOrgOverrides(orgId),
  ])

  if (tier === 'suspended') return false

  // Org-level override wins
  const override = overrides.find((o) => o.feature === feature)
  if (override !== undefined) return override.enabled

  // Tier default
  const config = configs.find((c) => c.tier === tier && c.feature === feature)
  return config?.enabled ?? false
}

/** Returns the numeric limit for a feature, or null if unlimited. */
export async function getLimit(orgId: string, feature: LimitFeature): Promise<number | null> {
  const [tier, configs, overrides] = await Promise.all([
    getOrgTier(orgId),
    loadPlanConfigs(),
    getOrgOverrides(orgId),
  ])

  if (tier === 'suspended') return 0

  // Org-level override wins
  const override = overrides.find((o) => o.feature === feature)
  if (override !== undefined) return override.limit_value  // null = unlimited

  // Tier default: if enabled=false the limit is not active (treat as unlimited)
  const config = configs.find((c) => c.tier === tier && c.feature === feature)
  if (!config || !config.enabled) return null
  return config.limit_value  // null = unlimited
}


/** Returns the count of active leagues for an org. */
export async function getActiveLeagueCount(orgId: string): Promise<number> {
  const supabase = createServiceRoleClient()
  const { count } = await supabase
    .from('leagues')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['registration_open', 'active'])
  return count ?? 0
}

// ── Legacy exports (keep existing call sites working) ────────────────────────

/** @deprecated Use canAccess() with a BooleanFeature instead */
export type Feature_Legacy = BooleanFeature  // alias for old imports
