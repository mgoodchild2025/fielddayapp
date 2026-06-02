'use client'

import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ICON, isOfflineMethod, type PaymentMethod } from '@/lib/payment-methods'

interface Props {
  value: PaymentMethod[]
  onChange: (methods: PaymentMethod[]) => void
  instructions: string
  onInstructionsChange: (v: string) => void
  /** Show only when the price is > 0 (no point choosing methods for a free event). */
  disabled?: boolean
}

/**
 * Per-league payment method selector. Admins pick which methods players may use;
 * if any offline method is enabled, a per-league instructions field appears
 * (falls back to the org-wide instructions when left blank).
 */
export function PaymentMethodsField({ value, onChange, instructions, onInstructionsChange, disabled }: Props) {
  const toggle = (m: PaymentMethod) => {
    if (value.includes(m)) onChange(value.filter((x) => x !== m))
    else onChange(PAYMENT_METHODS.filter((x) => x === m || value.includes(x)))
  }

  const anyOffline = value.some(isOfflineMethod)

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <p className="text-sm font-medium text-gray-700 mb-1">Accepted payment methods</p>
      <p className="text-xs text-gray-400 mb-2">
        Players choose from these at checkout. Leave all unchecked to use your organization&apos;s
        default payment setting.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const active = value.includes(m)
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggle(m)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                active ? 'border-transparent ring-2 ring-[var(--brand-primary,#16a34a)] bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-base">{PAYMENT_METHOD_ICON[m]}</span>
              <span className="flex-1 font-medium text-gray-800">{PAYMENT_METHOD_LABELS[m]}</span>
              <span className={`w-4 h-4 rounded border ${active ? 'bg-[var(--brand-primary,#16a34a)] border-transparent' : 'border-gray-300'}`}>
                {active && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>
          )
        })}
      </div>
      {value.includes('card') && (
        <p className="text-xs text-gray-400 mt-1.5">
          Card payments require Stripe to be configured in Settings → Payments.
        </p>
      )}

      {anyOffline && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Offline payment instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            rows={3}
            placeholder="e.g. Send Interac e-Transfer to pay@yourclub.ca, or bring cash to the first session."
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Shown to players who pick an offline method. Leave blank to use your organization&apos;s
            default instructions.
          </p>
        </div>
      )}
    </div>
  )
}
