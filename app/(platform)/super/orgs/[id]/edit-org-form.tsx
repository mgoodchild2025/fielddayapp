'use client'

import { useState } from 'react'
import { updateOrganization, updateSubscription, setOrgStatus } from '@/actions/platform'

type Org = {
  id: string
  name: string
  slug: string
  sport: string | null
  city: string | null
  status: string
}

type Sub = {
  plan_tier: string
  status: string
  trial_end: string | null
  current_period_end: string | null
} | null

export function EditOrgForm({ org, subscription }: { org: Org; subscription: Sub }) {
  const [orgForm, setOrgForm] = useState({
    name: org.name,
    slug: org.slug,
    sport: org.sport ?? 'multi',
    city: org.city ?? '',
    status: org.status as 'active' | 'suspended' | 'trial',
  })
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [orgSuccess, setOrgSuccess] = useState(false)

  const [subForm, setSubForm] = useState({
    plan_tier: (subscription?.plan_tier ?? 'starter') as 'starter' | 'pro' | 'club' | 'internal',
    status: (subscription?.status ?? 'trialing') as 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused',
    trial_end: subscription?.trial_end ? subscription.trial_end.slice(0, 10) : '',
  })
  const [subSaving, setSubSaving] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [subSuccess, setSubSuccess] = useState(false)

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault()
    setOrgSaving(true)
    setOrgError(null)
    setOrgSuccess(false)
    const result = await updateOrganization({ id: org.id, ...orgForm })
    if (result.error) {
      setOrgError(result.error)
    } else {
      setOrgSuccess(true)
      setTimeout(() => setOrgSuccess(false), 3000)
    }
    setOrgSaving(false)
  }

  async function saveSub(e: React.FormEvent) {
    e.preventDefault()
    setSubSaving(true)
    setSubError(null)
    setSubSuccess(false)
    const result = await updateSubscription({
      orgId: org.id,
      ...subForm,
      trial_end: subForm.trial_end || undefined,
    })
    if (result.error) {
      setSubError(result.error)
    } else {
      setSubSuccess(true)
      setTimeout(() => setSubSuccess(false), 3000)
    }
    setSubSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Organisation Details */}
      <form onSubmit={saveOrg} className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-4">Organization Details</h2>

        {orgError && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{orgError}</div>}
        {orgSuccess && <div className="mb-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">✓ Saved</div>}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={orgForm.name}
                onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))}
                required
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
              <input
                type="text"
                value={orgForm.slug}
                onChange={e => setOrgForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                required
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sport</label>
              <select
                value={orgForm.sport}
                onChange={e => setOrgForm(f => ({ ...f, sport: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="beach_volleyball">Beach Volleyball</option>
                <option value="volleyball">Volleyball</option>
                <option value="basketball">Basketball</option>
                <option value="soccer">Soccer</option>
                <option value="hockey">Hockey</option>
                <option value="softball">Softball</option>
                <option value="tennis">Tennis</option>
                <option value="pickleball">Pickleball</option>
                <option value="multi">Multi-sport</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <input
                type="text"
                value={orgForm.city}
                onChange={e => setOrgForm(f => ({ ...f, city: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                placeholder="Toronto"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={orgForm.status}
              onChange={e => setOrgForm(f => ({ ...f, status: e.target.value as typeof orgForm.status }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={orgSaving}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-60"
          >
            {orgSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Subscription */}
      <form onSubmit={saveSub} className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-4">Subscription</h2>

        {subError && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{subError}</div>}
        {subSuccess && <div className="mb-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">✓ Saved</div>}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Plan Tier</label>
              <select
                value={subForm.plan_tier}
                onChange={e => setSubForm(f => ({ ...f, plan_tier: e.target.value as typeof subForm.plan_tier }))}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="club">Club</option>
                <option value="internal">Internal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Billing Status</label>
              <select
                value={subForm.status}
                onChange={e => setSubForm(f => ({ ...f, status: e.target.value as typeof subForm.status }))}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="trialing">Trialing</option>
                <option value="active">Active</option>
                <option value="past_due">Past Due</option>
                <option value="paused">Paused</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trial End Date</label>
            <input
              type="date"
              value={subForm.trial_end}
              onChange={e => setSubForm(f => ({ ...f, trial_end: e.target.value }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={subSaving}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-60"
          >
            {subSaving ? 'Saving…' : 'Save Subscription'}
          </button>
        </div>
      </form>
    </div>
  )
}
