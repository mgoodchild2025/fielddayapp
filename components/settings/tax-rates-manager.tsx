'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTaxRate, deactivateTaxRate, type TaxRateInput } from '@/actions/tax-rates'

/**
 * Sales-tax rates (X1): the org defines its rates once; every checkout
 * applies them and every price display names them. Stripe tax rates are
 * immutable, so changing a rate = deactivate + add anew.
 */

export interface TaxRateRow {
  id: string
  displayName: string
  percentage: number
  inclusive: boolean
  appliesTo: string
  active: boolean
}

const SCOPE_LABEL: Record<string, string> = {
  all: 'Everything',
  registrations: 'Registrations only',
  merch: 'Merch only',
}

export function TaxRatesManager({ rates }: { rates: TaxRateRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<TaxRateInput>({ displayName: '', percentage: 13, inclusive: false, appliesTo: 'all' })

  const active = rates.filter((r) => r.active)

  function submit() {
    setErr(null)
    startTransition(async () => {
      const r = await createTaxRate(form)
      if (r.error) { setErr(r.error); return }
      setAdding(false)
      setForm({ displayName: '', percentage: 13, inclusive: false, appliesTo: 'all' })
      router.refresh()
    })
  }

  function remove(id: string) {
    setErr(null)
    startTransition(async () => {
      const r = await deactivateTaxRate(id)
      if (r.error) { setErr(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900">Sales Tax</h2>
      <p className="text-sm text-gray-500 mt-1">
        Rates apply to new charges the moment they&rsquo;re added — checkouts itemize them on the Stripe receipt,
        and offline payments record the same split. Discounts apply first, then tax.
      </p>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {active.length > 0 && (
        <ul className="mt-4 divide-y border rounded-lg">
          {active.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>
                <span className="font-semibold">{r.displayName} {r.percentage}%</span>
                <span className="ml-2 text-xs text-gray-400">
                  {SCOPE_LABEL[r.appliesTo] ?? r.appliesTo} · {r.inclusive ? 'included in prices' : 'added at checkout'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={isPending}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                Deactivate
              </button>
            </li>
          ))}
        </ul>
      )}
      {active.length === 0 && !adding && (
        <p className="mt-4 text-sm text-gray-400">No tax is being collected.</p>
      )}

      {adding ? (
        <div className="mt-4 space-y-3 rounded-lg border bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-gray-500">Name
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="HST"
                maxLength={20}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="text-xs text-gray-500">Rate %
              <input
                type="number" min="0.01" max="100" step="0.01"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="text-xs text-gray-500">Applies to
              <select
                value={form.appliesTo}
                onChange={(e) => setForm({ ...form, appliesTo: e.target.value as TaxRateInput['appliesTo'] })}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="all">Everything</option>
                <option value="registrations">Registrations only</option>
                <option value="merch">Merch only</option>
              </select>
            </label>
            <label className="text-xs text-gray-500">Mode
              <select
                value={form.inclusive ? 'inclusive' : 'exclusive'}
                onChange={(e) => setForm({ ...form, inclusive: e.target.value === 'inclusive' })}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="exclusive">Added at checkout</option>
                <option value="inclusive">Included in prices</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isPending ? 'Adding…' : 'Add rate'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={isPending || active.length >= 2}
          className="mt-4 text-sm font-medium disabled:opacity-50"
          style={{ color: 'var(--brand-primary)' }}
          title={active.length >= 2 ? 'At most two active rates (e.g. GST + PST)' : undefined}
        >
          + Add tax rate
        </button>
      )}
    </div>
  )
}
