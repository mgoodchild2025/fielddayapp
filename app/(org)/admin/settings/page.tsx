import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_tier, status')
    .eq('organization_id', org.id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-4">
        <div className="bg-white rounded-lg border p-5">
          <h2 className="font-semibold mb-1">Organization</h2>
          <p className="text-sm text-gray-500 mb-3">Name, slug, and contact info.</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-500">Name</p><p className="font-medium">{org.name}</p></div>
            <div><p className="text-gray-500">Slug</p><p className="font-medium">{org.slug}</p></div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Branding</h2>
              <p className="text-sm text-gray-500">Colours, fonts, logo, and custom domain.</p>
            </div>
            <Link href="/admin/settings/branding" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Waivers</h2>
              <p className="text-sm text-gray-500">Liability waiver shown during player registration.</p>
            </div>
            <Link href="/admin/settings/waivers" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Event Rules</h2>
              <p className="text-sm text-gray-500">Reusable rule templates selectable per event.</p>
            </div>
            <Link href="/admin/settings/event-rules" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Admins</h2>
              <p className="text-sm text-gray-500">Manage org admins and league admins.</p>
            </div>
            <Link href="/admin/users" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Payments</h2>
              <p className="text-sm text-gray-500">Connect your Stripe account to accept online payments.</p>
            </div>
            <Link href="/admin/settings/payments" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Positions</h2>
              <p className="text-sm text-gray-500">Customise player positions available per sport.</p>
            </div>
            <Link href="/admin/settings/positions" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Discount Codes</h2>
              <p className="text-sm text-gray-500">Create and manage promo / discount codes.</p>
            </div>
            <Link href="/admin/settings/discounts" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
              Manage →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <h2 className="font-semibold mb-1">Subscription</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700 capitalize">
              {subscription?.plan_tier ?? 'Unknown'} plan
            </span>
            <span className={`text-sm ${subscription?.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
              {subscription?.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
