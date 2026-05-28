'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const DOC_OPTIONS = [
  { value: '', label: 'All documents' },
  { value: 'terms', label: 'Terms of Service' },
  { value: 'tenant-privacy', label: 'Privacy Policy for Tenants' },
  { value: 'dpa', label: 'Data Processing Addendum' },
]

interface Props {
  initialEmail: string
  initialSlug: string
  initialFrom: string
  initialTo: string
}

export function AcceptanceSearchForm({ initialEmail, initialSlug, initialFrom, initialTo }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [slug, setSlug] = useState(initialSlug)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (email) params.set('email', email)
    if (slug) params.set('slug', slug)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    router.push(`/super/legal/acceptances?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">User email (contains)</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Document</label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {DOC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">From date</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">To date</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
      <button
        type="submit"
        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
      >
        Search
      </button>
    </form>
  )
}
