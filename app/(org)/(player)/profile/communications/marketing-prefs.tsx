'use client'

import { useState, useTransition } from 'react'
import { setMarketingConsent } from '@/actions/player-consents'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export function MarketingPrefs({ initialEmail, initialSms }: { initialEmail: boolean; initialSms: boolean }) {
  const [email, setEmail] = useState(initialEmail)
  const [sms, setSms] = useState(initialSms)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function update(type: 'marketing_email' | 'marketing_sms', value: boolean) {
    if (type === 'marketing_email') setEmail(value)
    else setSms(value)
    setSaved(false)
    startTransition(async () => {
      await setMarketingConsent(type, value)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="bg-white rounded-lg border divide-y">
      <div className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium text-gray-900">Promotional emails</p>
          <p className="text-sm text-gray-500 mt-0.5">News about leagues, events, and offers.</p>
        </div>
        <Toggle checked={email} onChange={(v) => update('marketing_email', v)} disabled={isPending} />
      </div>
      <div className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium text-gray-900">Promotional SMS</p>
          <p className="text-sm text-gray-500 mt-0.5">Occasional promotional texts. Reply STOP any time.</p>
        </div>
        <Toggle checked={sms} onChange={(v) => update('marketing_sms', v)} disabled={isPending} />
      </div>
      <div className="px-5 py-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Transactional messages (game schedules, registration confirmations) are not affected by these preferences.
        </p>
        {saved && <span className="text-xs text-green-600 shrink-0 ml-2">✓ Saved</span>}
      </div>
    </div>
  )
}
