import Link from 'next/link'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { StaffManager } from './staff-manager'

export default async function StaffPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin'])

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staff } = await (db as any)
    .from('org_staff')
    .select('id, name, role, bio, avatar_url, display_order')
    .eq('organization_id', org.id)
    .order('display_order')

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/settings/website" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Website</Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-2xl font-bold">Staff & Volunteers</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Feature the people who make your league run — coordinators, coaches, referees, and volunteers.
      </p>
      <StaffManager initialStaff={staff ?? []} />
    </div>
  )
}
