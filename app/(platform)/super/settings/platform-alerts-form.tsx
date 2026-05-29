'use client'

import { useState, useTransition } from 'react'
import { setPlatformAlerts, type PlatformAlerts } from '@/actions/platform-settings'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

const ALERTS = [
  {
    key: 'newOrg' as const,
    label: 'New organization signed up',
    description: 'Fires when any organization completes registration on the platform.',
    icon: '🏢',
  },
  {
    key: 'subscriptionChange' as const,
    label: 'Subscription changed',
    description: 'Fires when an org upgrades, downgrades, hibernates, or resumes their plan.',
    icon: '💳',
  },
  {
    key: 'trialExpiring' as const,
    label: 'Trial expiring in 3 days',
    description: 'Fires once per org when their free trial has 3 days remaining.',
    icon: '⏰',
  },
  {
    key: 'billingFailure' as const,
    label: 'Stripe billing failure',
    description: 'Fires when a Fieldday subscription payment fails (invoice not collected).',
    icon: '⚠️',
  },
  {
    key: 'accountDeletion' as const,
    label: 'Account deletion requested',
    description: 'Fires when an org admin submits an account closure request.',
    icon: '🗑️',
  },
]

export function PlatformAlertsForm({ initial }: { initial: PlatformAlerts }) {
  const [email, setEmail] = useState(initial.email ?? '')
  const [toggles, setToggles] = useState<Omit<PlatformAlerts, 'email'>>({
    newOrg:             initial.newOrg,
    subscriptionChange: initial.subscriptionChange,
    trialExpiring:      initial.trialExpiring,
    billingFailure:     initial.billingFailure,
    accountDeletion:    initial.accountDeletion,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setPlatformAlerts({ email: email.trim() || null, ...toggles })
      if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Recipient email */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Alert recipient email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="e.g. alerts@fielddayapp.ca"
          className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 mt-1.5">
          {email.trim()
            ? `All enabled alerts will be sent to ${email.trim()}.`
            : 'Leave blank to send alerts to all Platform Admin accounts.'}
        </p>
      </div>

      {/* Alert toggles */}
      <div className="divide-y divide-gray-700 rounded-lg border border-gray-700 overflow-hidden">
        {ALERTS.map(alert => (
          <div key={alert.key} className="flex items-start justify-between gap-4 px-4 py-3.5 bg-gray-750 hover:bg-gray-700/50 transition-colors">
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-base mt-0.5 shrink-0">{alert.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 leading-snug">{alert.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{alert.description}</p>
              </div>
            </div>
            <Toggle
              checked={toggles[alert.key]}
              onChange={v => setToggles(t => ({ ...t, [alert.key]: v }))}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
      </div>
    </form>
  )
}
