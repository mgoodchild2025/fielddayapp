import { getOrgBrandingCached } from '@/lib/org-cache'
import { getOrgTimezone } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { readableTextOn } from '@/lib/contrast'
import { cached } from '@/lib/org-cache'

/** What the door pages need from the org: name, logo, colours, timezone. */
export type DoorBrand = {
  orgName: string
  logoUrl: string | null
  primary: string
  onPrimary: string
  secondary: string
  onSecondary: string
  timezone: string
}

export async function doorBrand(orgId: string): Promise<DoorBrand> {
  const [branding, timezone, org] = await Promise.all([
    getOrgBrandingCached(orgId),
    getOrgTimezone(orgId),
    cached(`door-org-name:${orgId}`, 60_000, async () => {
      const { data } = await createServiceRoleClient().from('organizations').select('name').eq('id', orgId).maybeSingle()
      return data?.name ?? ''
    }),
  ])
  const primary = branding?.primary_color ?? '#FF5C00'
  const secondary = branding?.secondary_color ?? '#0F1F3D'
  return {
    orgName: org,
    logoUrl: branding?.logo_url ?? null,
    primary,
    onPrimary: readableTextOn(primary),
    secondary,
    onSecondary: readableTextOn(secondary),
    timezone,
  }
}

/** CSS variables for a door page wrapper. */
export function doorBrandStyle(b: DoorBrand): Record<string, string> {
  return {
    '--door-primary': b.primary,
    '--door-on-primary': b.onPrimary,
    '--door-secondary': b.secondary,
    '--door-on-secondary': b.onSecondary,
  }
}
