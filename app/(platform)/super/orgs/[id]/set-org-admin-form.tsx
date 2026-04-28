'use client'

import { useState } from 'react'
import { setOrgAdmin } from '@/actions/platform'

interface Props {
  orgId: string
  currentAdmins: { name: string | null; email: string | null }[]
}

export function SetOrgAdminForm({ orgId, currentAdmins }: Props) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    const result = await setOrgAdmin(orgId, email)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(`${result.name ?? email} is now an Org Admin.`)
      setEmail('')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <h2 className="font-semibold mb-1">Org Admin</h2>
      <p className="text-xs text-gray-500 mb-3">Assign any existing user as an org admin by their email address.</p>

      {currentAdmins.length > 0 && (
        <div className="mb-3 space-y-1">
          {currentAdmins.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
              <span className="font-medium">{a.name ?? '—'}</span>
              <span className="text-gray-400 text-xs">{a.email}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="user@example.com"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-60 whitespace-nowrap"
        >
          {saving ? 'Assigning…' : 'Set Admin'}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-green-600">✓ {success}</p>}
    </div>
  )
}
