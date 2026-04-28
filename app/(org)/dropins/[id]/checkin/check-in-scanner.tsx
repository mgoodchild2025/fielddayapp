'use client'

import { useState } from 'react'
import { checkInByToken } from '@/actions/dropins'

export function CheckInScanner({ sessionId }: { sessionId: string }) {
  const [token, setToken] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCheck(t: string) {
    if (!t.trim()) return
    setLoading(true)
    const res = await checkInByToken(t.trim())
    setResult({ ok: !res.error, message: res.error ?? 'Checked in successfully!' })
    setToken('')
    setLoading(false)
    setTimeout(() => setResult(null), 4000)
  }

  return (
    <div className="bg-white rounded-xl border p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Scan or paste QR token</label>
        <input
          type="text"
          value={token}
          autoFocus
          onChange={e => setToken(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCheck(token)}
          placeholder="Paste QR token or scan…"
          className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
        />
        <p className="text-xs text-gray-400 mt-1">Press Enter or click Check In after scanning.</p>
      </div>

      <button
        onClick={() => handleCheck(token)}
        disabled={loading || !token.trim()}
        className="w-full py-3 rounded-md text-white font-semibold disabled:opacity-50"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Checking…' : 'Check In'}
      </button>

      {result && (
        <div className={`p-4 rounded-lg text-center font-semibold ${result.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </div>
      )}

      <div className="text-center">
        <p className="text-xs text-gray-400">
          Players show their QR code from their registration confirmation email.
        </p>
      </div>
    </div>
  )
}
