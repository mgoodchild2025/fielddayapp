import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { WaiverList } from './waiver-list'

export default async function AdminWaiversPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: waivers } = await supabase
    .from('waivers')
    .select('*')
    .eq('organization_id', org.id)
    .order('is_active', { ascending: false }) // active first
    .order('created_at', { ascending: false })

  // Fetch signature counts for all waivers in one query
  const { data: sigCounts } = await supabase
    .from('waiver_signatures')
    .select('waiver_id')
    .in('waiver_id', (waivers ?? []).map(w => w.id))

  const sigCountMap = new Map<string, number>()
  for (const row of sigCounts ?? []) {
    sigCountMap.set(row.waiver_id, (sigCountMap.get(row.waiver_id) ?? 0) + 1)
  }

  const waiversWithCounts = (waivers ?? []).map(w => ({
    ...w,
    signature_count: sigCountMap.get(w.id) ?? 0,
  }))

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Waivers</h1>
          <p className="text-sm text-gray-500 mt-1">
            The <strong>active</strong> waiver is shown to players during registration. Each league can also use a specific waiver set on its Overview page.
          </p>
        </div>
        <Link
          href="/admin/settings/waivers/signatures"
          className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-md border hover:bg-gray-50 transition-colors"
          style={{ color: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' }}
        >
          View Signed Waivers →
        </Link>
      </div>

      <WaiverList waivers={waiversWithCounts} />
    </div>
  )
}
