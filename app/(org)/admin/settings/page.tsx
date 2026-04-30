import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
const planColors: Record<string, string> = {
  starter:      'bg-gray-100 text-gray-600',
  pro:          'bg-purple-100 text-purple-700',
  enterprise:   'bg-blue-100 text-blue-700',
}

export default async function AdminSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: m } = await supabase.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single()
    if (m?.role === 'league_admin') redirect('/admin/events')
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_tier, status')
    .eq('organization_id', org.id)
    .single()

  const tier = subscription?.plan_tier ?? 'unknown'

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Org info + subscription — compact, read-only */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold truncate">{org.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{org.slug}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${planColors[tier] ?? 'bg-gray-100 text-gray-600'}`}>
              {tier} plan
            </span>
            {subscription?.status && (
              <span className={`text-xs ${subscription.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                {subscription.status}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-400 text-center">
        Select a category from the dropdown to manage your settings.
      </p>
    </div>
  )
}
