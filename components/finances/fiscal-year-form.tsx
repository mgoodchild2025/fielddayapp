'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setFiscalYearStart } from '@/actions/finances'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** Fiscal year start month — drives the financial report's presets. */
export function FiscalYearForm({ startMonth }: { startMonth: number }) {
  const router = useRouter()
  const [month, setMonth] = useState(startMonth)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: number) {
    setMonth(next)
    setSaved(false)
    setError(null)
    startTransition(async () => {
      const res = await setFiscalYearStart(next)
      if (res.error) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="mt-8">
      <div className="mb-4">
        <h2 className="text-lg font-bold">Fiscal year</h2>
        <p className="text-sm text-gray-500 mt-1">
          When your financial year starts. The financial report&rsquo;s &ldquo;This fiscal year&rdquo;
          and &ldquo;Last fiscal year&rdquo; presets follow this.
        </p>
      </div>
      <div className="bg-white rounded-lg border p-6 flex items-center gap-3">
        <label className="text-sm text-gray-600" htmlFor="fy-start">Fiscal year starts in</label>
        <select
          id="fy-start"
          value={month}
          onChange={(e) => save(Number(e.target.value))}
          disabled={pending}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        {pending && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && !pending && <span className="text-xs text-green-600">Saved ✓</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
