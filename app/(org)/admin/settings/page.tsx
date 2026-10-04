import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SETTINGS_GROUPS } from '@/lib/settings-categories'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Settings' }
const planColors: Record<string, string> = {
  starter:      'bg-gray-100 text-gray-600',
  pro:          'bg-purple-100 text-purple-700',
  enterprise:   'bg-blue-100 text-blue-700',
}

export default async function AdminSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {

    const { data: m } = await db.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single()
    if (m?.role === 'league_admin') redirect('/admin/events')
  }


  const { data: subscription } = await db
    .from('subscriptions')
    .select('plan_tier, status')
    .eq('organization_id', org.id)
    .single()

  const tier = subscription?.plan_tier ?? 'unknown'

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Org info + subscription — compact, read-only */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold truncate">{org.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{org.slug}</p>
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

      {/* Every category, grouped, so admins can find a setting by reading. */}
      <div className="space-y-6">
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`settings-${group.title}`}>
            <h2 id={`settings-${group.title}`} className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 px-1">
              {group.title}
            </h2>
            <ul className="bg-white rounded-lg border divide-y divide-gray-100 overflow-hidden">
              {group.items.map(({ href, label, description, Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3 min-h-14 hover:bg-gray-50 transition-colors">
                    <span className="w-8 h-8 rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
