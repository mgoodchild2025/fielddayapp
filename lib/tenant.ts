import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { cached, getOrgBrandingCached } from '@/lib/org-cache'

export type OrgContext = {
  id: string
  slug: string
  name: string
}

// Org identity (id, slug, name) by id: cached across requests for 30s
// (lib/org-cache.ts) and keyed on the id string — the React cache() wrapper
// keyed on the headers object didn't reliably dedupe within a render.
const loadOrg = (orgId: string) =>
  cached(`org:${orgId}`, 30_000, async (): Promise<OrgContext> => {
    const { data, error } = await createServiceRoleClient()
      .from('organizations')
      .select('id, slug, name')
      .eq('id', orgId)
      .single()
    if (error || !data) throw new Error(`Org not found for id: ${orgId}`)
    return data
  })

export async function getCurrentOrg(headersList: ReadonlyHeaders): Promise<OrgContext> {
  const orgId = headersList.get('x-org-id')
  if (!orgId) throw new Error('No org context: x-org-id header missing')
  return loadOrg(orgId)
}

/**
 * The org's display timezone (org_branding.timezone, default America/Toronto).
 * Server components render in UTC, so any time they print must be formatted
 * in this zone — e.g. formatGameTime(iso, await getOrgTimezone(org.id)).
 */
export async function getOrgTimezone(orgId: string): Promise<string> {
  return (await getOrgBrandingCached(orgId))?.timezone ?? 'America/Toronto'
}
