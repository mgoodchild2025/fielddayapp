import { createServiceRoleClient } from '@/lib/supabase/service'
import type { OrgBranding } from '@/types/database'
import { getOrgTaxRates, type OrgTaxRate } from '@/lib/tax'

/**
 * Small in-memory cache for per-org data that every page reads but that
 * changes rarely: branding, the maintenance / hibernation gate, plan, legal
 * document versions. The app runs as one long-lived process (Railway), so a
 * module-level map is shared by every request — same approach as the proxy's
 * host→org cache and lib/features' plan-config cache.
 *
 * - Short TTLs, so anything not explicitly invalidated (e.g. Stripe webhooks)
 *   still settles within seconds.
 * - Concurrent requests for the same key share one in-flight query.
 * - Writers call `invalidateOrgCache(orgId)` (or `invalidateGlobalCache()`) so
 *   an admin's own edits show on the next page load.
 * - Cached values are shared between requests — treat them as read-only.
 */

type Entry = { value: Promise<unknown>; expires: number }
const store = new Map<string, Entry>()
const MAX_ENTRIES = 5_000

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expires > now) return hit.value as Promise<T>
  const value = load().catch((err) => {
    store.delete(key) // never cache a failure
    throw err
  })
  if (store.size >= MAX_ENTRIES) store.clear()
  store.set(key, { value, expires: now + ttlMs })
  return value
}

/** Drop everything cached for one org (after a write that affects it). */
export function invalidateOrgCache(orgId: string) {
  for (const key of store.keys()) if (key.endsWith(`:${orgId}`)) store.delete(key)
}

/** Drop platform-wide entries (maintenance switch, legal versions). */
export function invalidateGlobalCache() {
  for (const key of store.keys()) if (key.startsWith('global:')) store.delete(key)
}

/** Test helper. */
export function clearOrgCache() {
  store.clear()
}

const ORG_TTL = 30_000

// ── Loaders ─────────────────────────────────────────────────────────────────

export function getOrgBrandingCached(orgId: string): Promise<OrgBranding | null> {
  return cached(`branding:${orgId}`, ORG_TTL, async () => {
    const { data } = await createServiceRoleClient()
      .from('org_branding').select('*').eq('organization_id', orgId).maybeSingle()
    return (data as OrgBranding | null) ?? null
  })
}

export type OrgGate = {
  name: string | null
  maintenance_mode: boolean | null
  maintenance_message: string | null
  maintenance_until: string | null
  subscriptionStatus: string | null
  hibernate_until: string | null
}

/** Everything the org layout's maintenance / hibernation gate needs. */
export function getOrgGateCached(orgId: string): Promise<OrgGate> {
  return cached(`gate:${orgId}`, ORG_TTL, async () => {
    const db = createServiceRoleClient()
    const [{ data: org }, { data: sub }] = await Promise.all([
      db.from('organizations').select('name, maintenance_mode, maintenance_message, maintenance_until').eq('id', orgId).maybeSingle(),
      db.from('subscriptions').select('status, hibernate_until').eq('organization_id', orgId).maybeSingle(),
    ])
    return {
      name: org?.name ?? null,
      maintenance_mode: org?.maintenance_mode ?? null,
      maintenance_message: org?.maintenance_message ?? null,
      maintenance_until: org?.maintenance_until ?? null,
      subscriptionStatus: (sub?.status as string | undefined) ?? null,
      hibernate_until: (sub as { hibernate_until?: string | null } | null)?.hibernate_until ?? null,
    }
  })
}

/** Platform-wide maintenance switch (platform_settings). */
export function getPlatformMaintenanceCached(): Promise<Map<string, string>> {
  return cached('global:maintenance', ORG_TTL, async () => {
    const { data } = await createServiceRoleClient()
      .from('platform_settings')
      .select('key, value')
      .in('key', ['maintenance_mode_all', 'maintenance_mode_message', 'maintenance_mode_until'])
    return new Map(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]))
  })
}

/** The org's active sales-tax rates (layout cart hint, event prices). */
export function getOrgTaxRatesCached(orgId: string): Promise<OrgTaxRate[]> {
  return cached(`tax:${orgId}`, ORG_TTL, () => getOrgTaxRates(createServiceRoleClient(), orgId))
}
