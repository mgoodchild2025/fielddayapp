'use client'

import { useEffect, useState } from 'react'
import { backOutTax } from '@/lib/expense-tax'

const LAST_PCT_KEY = 'fieldday-expense-tax-pct'

/**
 * One-tap "back the tax out of a total" helper for expense forms.
 * The rate prefills from the org's configured sales tax when there is one;
 * otherwise it remembers whatever the admin typed last (an org that doesn't
 * charge tax still pays HST on its rentals), so the helper is always usable.
 */
export function TaxCalc({ amount, defaultPct = 0, onCalc }: {
  /** The gross amount as typed in the form (dollars). */
  amount: string
  /** Org's combined active sales-tax rate, if configured. */
  defaultPct?: number
  onCalc: (taxDollars: string) => void
}) {
  const [pct, setPct] = useState<string>(defaultPct > 0 ? String(defaultPct) : '')

  useEffect(() => {
    if (defaultPct > 0) return
    try {
      const saved = localStorage.getItem(LAST_PCT_KEY)
      if (saved) setPct(saved)
    } catch {}
  }, [defaultPct])

  const pctNum = parseFloat(pct)
  const cents = Math.round(parseFloat(amount) * 100)
  const ready = !isNaN(pctNum) && pctNum > 0 && !isNaN(cents) && cents > 0

  function calc() {
    if (!ready) return
    onCalc((backOutTax(cents, pctNum) / 100).toFixed(2))
    try {
      localStorage.setItem(LAST_PCT_KEY, pct)
    } catch {}
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <button
        type="button"
        onClick={calc}
        disabled={!ready}
        className="px-2.5 py-1.5 rounded-l border bg-white text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        title="Back the tax out of the total at this rate"
      >
        Calc
      </button>
      <span className="relative">
        <input
          type="number"
          step="0.01"
          min="0"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          placeholder="13"
          aria-label="Tax rate percent"
          className="w-16 border border-l-0 rounded-r pl-2 pr-5 py-1.5 text-xs text-gray-700"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
      </span>
    </span>
  )
}
