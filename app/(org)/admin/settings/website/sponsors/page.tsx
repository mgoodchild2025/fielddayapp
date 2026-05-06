import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { SponsorManager } from './sponsor-manager'

export default async function SponsorsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sponsors } = await (db as any)
    .from('org_sponsors')
    .select('id, name, logo_url, website_url, tier, display_order')
    .eq('organization_id', org.id)
    .order('tier').order('display_order')

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/settings/website" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Website</Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-2xl font-bold">Sponsors</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Sponsors are displayed on your public homepage. Use tiers to control sizing — Gold sponsors appear largest.
      </p>
      <SponsorManager initialSponsors={sponsors ?? []} />
    </div>
  )
}
