'use client'

import { useState, useTransition } from 'react'
import { upsertPaymentPlan, deletePaymentPlan } from '@/actions/payment-plans'
import { useRouter } from 'next/navigation'

interface Plan {
  id?: string
  name: string
  installments: number
  interval_days: number
  upfront_percent: number
  enabled: boolean
}

interface Props {
  leagueId: string
  existing?: Plan | null
}

export function PaymentPlanConfig({ leagueId, existing }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(existing?.name ?? 'Installment Plan')
  const [installments, setInstallments] = useState(String(existing?.installments ?? 3))
  const [intervalDays, setIntervalDays] = useState(String(existing?.interval_days ?? 30))
  const [upfrontPercent, setUpfrontPercent] = useState(String(existing?.upfront_percent ?? 0))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await upsertPaymentPlan({
        league_id: leagueId,
        name,
        installments,
        interval_days: intervalDays,
        upfront_percent: upfrontPercent,
        enabled: true,
      })
      if (result.error) { setError(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirm('Remove payment plan for this event?')) return
    start(async () => { await deletePaymentPlan(leagueId); router.refresh() })
  }

  const inputClass = 'w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400'

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">Payment Plan</h2>
        {existing && (
          <button onClick={handleDelete} disabled={pending} className="text-xs text-red-500 hover:underline disabled:opacity-50">
            Remove
          </button>
        )}
      </div>

      {existing && !open ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{existing.name}</p>
          <p className="text-gray-500">{existing.installments} payments every {existing.interval_days} days</p>
          {existing.upfront_percent > 0 && <p className="text-gray-500">{existing.upfront_percent}% upfront</p>}
          <button onClick={() => setOpen(true)} className="text-xs mt-2 underline" style={{ color: 'var(--brand-primary)' }}>Edit</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div>
            <label className="text-xs text-gray-500 mb-0.5 block">Plan name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className={inputClass} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Payments</label>
              <input type="number" min={2} max={12} value={installments} onChange={e => setInstallments(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Every (days)</label>
              <input type="number" min={7} max={90} value={intervalDays} onChange={e => setIntervalDays(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">Upfront %</label>
              <input type="number" min={0} max={100} value={upfrontPercent} onChange={e => setUpfrontPercent(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            {existing && <button type="button" onClick={() => setOpen(false)} className="flex-1 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50">Cancel</button>}
            <button type="submit" disabled={pending} className="flex-1 py-1.5 text-xs text-white rounded-md disabled:opacity-50" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {pending ? 'Saving…' : existing ? 'Update' : 'Enable Plan'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
