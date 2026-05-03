'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { invalidatePlanConfigCache } from '@/lib/features'

export type PlanConfigRow = {
  tier: string
  feature: string
  enabled: boolean
  limit_value: number | null
}

/** Upsert the full plan config matrix. Called by the platform admin UI. */
export async function savePlanConfigs(rows: PlanConfigRow[]): Promise<{ error: string | null }> {
  if (!rows.length) return { error: null }

  const supabase = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('plan_configs')
    .upsert(
      rows.map((r) => ({
        tier: r.tier,
        feature: r.feature,
        enabled: r.enabled,
        limit_value: r.limit_value,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'tier,feature' }
    )

  if (error) return { error: error.message }

  // Bust the in-memory cache so the next request re-reads from DB
  invalidatePlanConfigCache()
  revalidatePath('/super/settings/plans')
  return { error: null }
}

/** Fetch all plan config rows (for the admin UI). */
export async function getPlanConfigs(): Promise<PlanConfigRow[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('plan_configs')
    .select('tier, feature, enabled, limit_value')
    .order('tier')
    .order('feature')
  return (data ?? []) as PlanConfigRow[]
}

/** Upsert a single per-org feature override. */
export async function saveOrgFeatureOverride(
  orgId: string,
  feature: string,
  enabled: boolean,
  limitValue: number | null,
  note: string
): Promise<{ error: string | null }> {
  const supabase = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('org_feature_overrides')
    .upsert(
      { organization_id: orgId, feature, enabled, limit_value: limitValue, note, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,feature' }
    )
  if (error) return { error: error.message }
  revalidatePath(`/super/orgs/${orgId}`)
  return { error: null }
}

/** Delete a per-org feature override (revert to tier default). */
export async function deleteOrgFeatureOverride(
  orgId: string,
  feature: string
): Promise<{ error: string | null }> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('org_feature_overrides')
    .delete()
    .eq('organization_id', orgId)
    .eq('feature', feature)
  if (error) return { error: error.message }
  revalidatePath(`/super/orgs/${orgId}`)
  return { error: null }
}

/** Fetch all overrides for a specific org. */
export async function getOrgFeatureOverrides(orgId: string) {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('org_feature_overrides')
    .select('feature, enabled, limit_value, note')
    .eq('organization_id', orgId)
    .order('feature')
  return data ?? []
}
