'use client'

import { useState, useTransition } from 'react'
import { createDiscount } from '@/actions/discounts'
import { useRouter } from 'next/navigation'

export function DiscountForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [type, setType] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [appliesTo, setAppliesTo] = useState<'all' | 'leagues' | 'dropins'>('all')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await createDiscount({
        code,
        type,
        value,
        max_uses: maxUses ? parseInt(maxUses) : null,
        expires_at: expiresAt || null,
        applies_to: appliesTo,
      })
      if (result.error) { setError(result.error); return }
      setCode(''); setValue(''); setMaxUses(''); setExpiresAt('')
      router.refresh()
    })
  }

  const inputClass = 'border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
          <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required className={`${inputClass} w-full font-mono`} placeholder="SUMMER20" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Applies To</label>
          <select value={appliesTo} onChange={e => setAppliesTo(e.target.value as 'all' | 'leagues' | 'dropins')} className={`${inputClass} w-full`}>
            <option value="all">All</option>
            <option value="leagues">Leagues only</option>
            <option value="dropins">Drop-ins only</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
          <select value={type} onChange={e => setType(e.target.value as 'percent' | 'fixed')} className={`${inputClass} w-full`}>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed ($)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Value *</label>
          <input type="number" min={0} step={type === 'percent' ? 1 : 0.01} value={value} onChange={e => setValue(e.target.value)} required className={`${inputClass} w-full`} placeholder={type === 'percent' ? '20' : '10.00'} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Uses</label>
          <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(e.target.value)} className={`${inputClass} w-full`} placeholder="Unlimited" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Expires At</label>
        <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className={`${inputClass}`} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2 rounded-md text-white text-sm font-semibold disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {pending ? 'Creating…' : 'Create Code'}
      </button>
    </form>
  )
}
