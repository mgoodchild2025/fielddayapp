'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrganization } from '@/actions/platform'

export function CreateOrgForm({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    sport: 'beach_volleyball',
    city: '',
    plan_tier: 'starter' as 'starter' | 'pro' | 'club' | 'internal',
    adminEmail: '',
  })

  function handleNameChange(name: string) {
    setForm(f => ({
      ...f,
      name,
      slug: f.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await createOrganization({ ...form, adminEmail: form.adminEmail || undefined })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.push(`/super/orgs/${result.data!.id}`)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">New Organization</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="Westside Sports Co."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <div className="flex items-center border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-gray-400">
              <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-r select-none">slug:</span>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                required
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
                placeholder="westside-sports"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Used in subdomain: {form.slug || 'your-slug'}.fielddayapp.ca</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
              <select
                value={form.sport}
                onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                placeholder="Toronto"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={form.plan_tier}
              onChange={e => setForm(f => ({ ...f, plan_tier: e.target.value as typeof form.plan_tier }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="club">Club</option>
              <option value="internal">Internal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Org Admin Email <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="email"
              value={form.adminEmail}
              onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="admin@example.com"
            />
            <p className="text-xs text-gray-400 mt-1">Must be an existing user. They will be assigned as org admin.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60"
            >
              {loading ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
