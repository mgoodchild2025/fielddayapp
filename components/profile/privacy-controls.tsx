'use client'

import { useState, useTransition } from 'react'
import { exportMyData, deleteMyAccount } from '@/actions/privacy'

export function DataExportButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    const { data, error } = await exportMyData()
    if (error || !data) {
      setError(error ?? 'Export failed')
      setLoading(false)
      return
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fieldday-my-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setLoading(false)
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {loading ? 'Preparing…' : 'Download my data'}
      </button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpen() { setOpen(true); setConfirmation(''); setReason(''); setError(null) }
  function handleClose() { setOpen(false); setConfirmation(''); setReason(''); setError(null) }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteMyAccount(confirmation, reason)
      if (result?.error) setError(result.error)
      // On success the server redirects to /goodbye — no client-side action needed
    })
  }

  const canSubmit = confirmation.trim().toUpperCase() === 'DELETE' && !isPending

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete my account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete your account?</h2>
            <p className="text-sm text-gray-500 mb-4">This is permanent and cannot be undone.</p>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">The following will be permanently removed:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                <li>Your profile and contact information</li>
                <li>Team memberships and RSVPs</li>
                <li>Emergency contact and player details</li>
              </ul>
              <p className="font-semibold mt-2">The following are retained per Canadian tax law:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                <li>Payment records (7-year retention)</li>
                <li>Registration and waiver records</li>
              </ul>
              <p className="text-xs mt-2 text-amber-600">These retained records are anonymized — they will no longer be linked to your name or email.</p>
            </div>

            <label className="block mb-1 text-sm font-medium text-gray-700">
              Reason <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. no longer playing, privacy concerns…"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
            />

            <label className="block mb-1 text-sm font-medium text-gray-700">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder="DELETE"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
              autoComplete="off"
            />

            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium border text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!canSubmit}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
