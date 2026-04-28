'use client'

import { useTransition, useState } from 'react'
import { setSignupsEnabled } from '@/actions/platform-settings'

export function ToggleSignups({ enabled }: { enabled: boolean }) {
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function toggle() {
    const next = !isEnabled
    setIsEnabled(next)
    setSaved(false)
    start(async () => {
      await setSignupsEnabled(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-200 text-sm">Accept new sign-ups</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {isEnabled
            ? 'The public sign-up page is live and accepting new organizations.'
            : 'The sign-up page is showing a "paused" message to visitors.'}
        </p>
      </div>
      <div className="flex items-center gap-3 ml-6 shrink-0">
        {saved && <span className="text-xs text-emerald-400 font-medium">Saved</span>}
        <button
          onClick={toggle}
          disabled={pending}
          aria-label={isEnabled ? 'Disable sign-ups' : 'Enable sign-ups'}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 ${
            isEnabled ? 'bg-emerald-500' : 'bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
