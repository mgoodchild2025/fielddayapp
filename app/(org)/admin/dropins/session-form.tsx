'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDropInSession, updateDropInSession } from '@/actions/dropins'

interface Session {
  id: string
  name: string
  description?: string | null
  scheduled_at: string
  location?: string | null
  capacity: number
  price_cents: number
  sport: string
}

interface Props {
  session?: Session
}

export function DropInSessionForm({ session }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(session?.name ?? '')
  const [description, setDescription] = useState(session?.description ?? '')
  const [scheduledAt, setScheduledAt] = useState(
    session?.scheduled_at
      ? new Date(session.scheduled_at).toISOString().slice(0, 16)
      : ''
  )
  const [location, setLocation] = useState(session?.location ?? '')
  const [capacity, setCapacity] = useState(String(session?.capacity ?? 20))
  const [priceDollars, setPriceDollars] = useState(
    session ? String((session.price_cents / 100).toFixed(2)) : '0.00'
  )
  const [sport, setSport] = useState(session?.sport ?? 'multi')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const data = {
      name,
      description,
      scheduled_at: new Date(scheduledAt).toISOString(),
      location,
      capacity,
      price_cents: Math.round(parseFloat(priceDollars) * 100),
      sport,
    }
    startTransition(async () => {
      const result = session
        ? await updateDropInSession(session.id, data)
        : await createDropInSession(data)
      if (result.error) { setError(result.error); return }
      router.push('/admin/dropins')
    })
  }

  const inputClass = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div>
        <label className={labelClass}>Session Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required className={inputClass} placeholder="Tuesday Night Drop-in" />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={inputClass} placeholder="Optional details about this session…" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Date & Time *</label>
          <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputClass} placeholder="Gym A" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Capacity *</label>
          <input type="number" min={1} max={500} value={capacity} onChange={e => setCapacity(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Price (CAD)</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={priceDollars}
              onChange={e => setPriceDollars(e.target.value)}
              className={`${inputClass} pl-6`}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()} className="flex-1 py-2.5 rounded-md border border-gray-200 text-sm font-medium hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 py-2.5 rounded-md text-white font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {pending ? 'Saving…' : session ? 'Save Changes' : 'Create Session'}
        </button>
      </div>
    </form>
  )
}
