'use client'

export function PrintControls() {
  return (
    <div className="flex items-center gap-3 mb-8 print:hidden">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 rounded bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        🖨 Print / Save as PDF
      </button>
      <button
        onClick={() => window.close()}
        className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        ← Close
      </button>
    </div>
  )
}
