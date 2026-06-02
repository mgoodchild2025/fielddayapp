'use client'

import { useState, useTransition } from 'react'
import { setPlatformStripeMode } from '@/actions/platform-settings'
import type { PlatformStripeModeInfo } from '@/actions/platform-settings'

export function StripeModeForm({ initial }: { initial: PlatformStripeModeInfo }) {
  const [mode, setMode] = useState(initial.mode)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<null | 'test' | 'live'>(null)

  const target = confirming
  const switchTo = (m: 'test' | 'live') => {
    setError(null)
    setConfirming(m)
  }

  const confirm = () => {
    if (!target) return
    setError(null)
    startTransition(async () => {
      const res = await setPlatformStripeMode(target)
      if (res.error) setError(res.error)
      else setMode(target)
      setConfirming(null)
    })
  }

  const isTest = mode === 'test'

  return (
    <div className={`rounded-xl border p-5 ${isTest ? 'border-amber-300 bg-amber-50/40' : 'border-gray-800 bg-gray-900'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={`font-semibold ${isTest ? 'text-amber-900' : 'text-white'}`}>Platform Stripe Mode</h2>
          <p className={`text-sm mt-1 ${isTest ? 'text-amber-800' : 'text-gray-400'}`}>
            Controls which Stripe keys Fieldday subscription billing uses. Switching takes effect
            immediately — no Railway changes needed.
          </p>
        </div>
        <span className={`shrink-0 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
          isTest ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {isTest ? 'Test mode' : 'Live mode'}
        </span>
      </div>

      {/* Configured-state hints */}
      <div className={`mt-4 grid grid-cols-2 gap-3 text-xs ${isTest ? 'text-amber-800' : 'text-gray-400'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${initial.liveConfigured ? 'bg-emerald-500' : 'bg-gray-500'}`} />
          Live keys {initial.liveConfigured ? 'configured' : 'missing'}
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${initial.testConfigured ? 'bg-emerald-500' : 'bg-gray-500'}`} />
          Test keys {initial.testConfigured ? 'configured' : 'missing'}
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

      {confirming ? (
        <div className={`mt-4 rounded-lg border p-4 ${isTest ? 'border-amber-300 bg-white' : 'border-gray-700 bg-gray-800'}`}>
          <p className={`text-sm ${isTest ? 'text-gray-800' : 'text-gray-200'}`}>
            Switch platform billing to <strong>{confirming.toUpperCase()}</strong> mode?
            {confirming === 'live'
              ? ' Real charges will be processed.'
              : ' No real charges will occur while in test mode.'}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={confirm}
              disabled={pending}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: confirming === 'live' ? '#059669' : '#d97706' }}
            >
              {pending ? 'Switching…' : `Yes, switch to ${confirming}`}
            </button>
            <button
              onClick={() => setConfirming(null)}
              className={`px-4 py-2 rounded-md text-sm border ${isTest ? 'text-gray-600 border-gray-300 hover:bg-gray-50' : 'text-gray-300 border-gray-600 hover:bg-gray-700'}`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => switchTo('test')}
            disabled={isTest || !initial.testConfigured}
            className="px-4 py-2 rounded-md text-sm font-medium border border-amber-300 text-amber-800 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-50"
          >
            Switch to Test
          </button>
          <button
            onClick={() => switchTo('live')}
            disabled={!isTest || !initial.liveConfigured}
            className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-600 text-emerald-700 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-50"
          >
            Switch to Live
          </button>
        </div>
      )}
    </div>
  )
}
