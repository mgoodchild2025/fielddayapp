import { headers } from 'next/headers'
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

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Waivers</h1>
        <p className="text-sm text-gray-500 mt-1">
          The <strong>active</strong> waiver is shown to players during registration. Each league can also use a specific waiver set on its Overview page.
        </p>
      </div>

      <WaiverList waivers={waivers ?? []} />
    </div>
  )
}
