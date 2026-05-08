'use client'

import { useState, useTransition } from 'react'
import { saveRegistrationPaymentSettings } from '@/actions/payment-settings'

interface Props {
  mode: 'stripe' | 'manual'
  instructions: string | null
}

export function RegistrationPaymentForm({ mode, instructions }: Props) {
  const [selectedMode, setSelectedMode] = useState<'stripe' | 'manual'>(mode)
  const [text, setText] = useState(instructions ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveRegistrationPaymentSettings({
        registrationPaymentMode: selectedMode,
        registrationManualInstructions: selectedMode === 'manual' ? text : null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSelectedMode('stripe')}
          className={`flex flex-col gap-1 p-4 rounded-lg border-2 text-left transition-colors ${
            selectedMode === 'stripe'
              ? 'border-[var(--brand-primary)] bg-orange-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              selectedMode === 'stripe' ? 'border-[var(--brand-primary)]' : 'border-gray-300'
            }`}>
              {selectedMode === 'stripe' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
              )}
            </span>
            <span className="text-sm font-semibold text-gray-900">Online (Stripe)</span>
          </span>
          <span className="text-xs text-gray-500 pl-5">Players pay by card at checkout</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMode('manual')}
          className={`flex flex-col gap-1 p-4 rounded-lg border-2 text-left transition-colors ${
            selectedMode === 'manual'
              ? 'border-[var(--brand-primary)] bg-orange-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              selectedMode === 'manual' ? 'border-[var(--brand-primary)]' : 'border-gray-300'
            }`}>
              {selectedMode === 'manual' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
              )}
            </span>
            <span className="text-sm font-semibold text-gray-900">Manual / Offline</span>
          </span>
          <span className="text-xs text-gray-500 pl-5">E-transfer, cash, or cheque</span>
        </button>
      </div>

      {/* Manual instructions */}
      {selectedMode === 'manual' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Payment instructions
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. Send e-transfer to treasurer@myclub.ca with your name and league name in the message. Cash accepted at the first game."
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent resize-y"
          />
          <p className="text-xs text-gray-400 mt-1">
            Shown to players after they complete registration.
          </p>
        </div>
      )}

      {selectedMode === 'stripe' && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5 border">
          Stripe must be connected above for online checkout to work. If no Stripe key is saved,
          registration will fall back to manual payment automatically.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || (selectedMode === 'manual' && !text.trim())}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
