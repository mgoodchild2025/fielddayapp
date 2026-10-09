'use client'

import { usePrintOrShare } from './use-print-or-share'

/** Print / Save as PDF + a way back (see usePrintOrShare for the iPhone app path). */
export function PrintControls() {
  const p = usePrintOrShare()
  return (
    <div className="flex items-center gap-3 mb-8 print:hidden">
      <button
        onClick={p.print}
        disabled={p.busy}
        className="press min-h-10 px-4 py-2 rounded bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-60"
      >
        {p.label}
      </button>
      <button
        onClick={p.back}
        className="press min-h-10 px-4 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
      >
        {p.backLabel}
      </button>
    </div>
  )
}
