import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'
import { canAccess } from '@/lib/features'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { doorBrand } from '@/lib/door/brand'

/** A station for the admin print pages: admin + plan + same-org, else 404. */
export async function loadPrintableStation(stationId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error || !(await canAccess(org.id, 'door_alert')) || !z.string().uuid().safeParse(stationId).success) notFound()
  const { data: station } = await createServiceRoleClient().from('door_stations')
    .select('id, name, public_token, join_token, join_code').eq('id', stationId).eq('organization_id', org.id).maybeSingle()
  if (!station) notFound()
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? ''
  const origin = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`
  const brand = await doorBrand(org.id)
  return {
    station,
    origin,
    brand: { orgName: brand.orgName, logoUrl: brand.logoUrl, primary: brand.primary, secondary: brand.secondary },
  }
}
