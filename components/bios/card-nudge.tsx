'use client'

import { useSyncExternalStore, useState } from 'react'

/**
 * A player-card nudge the player can wave off. "Not now" hides it on this
 * device for `days` (localStorage, per key). Nothing renders on the server:
 * whether it was dismissed is only known in the browser, and rendering it
 * there first would flash it at everyone who already said no.
 */
const noSubscribe = () => () => {}

function readDismissed(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw != null && Number(raw) > Date.now()
  } catch {
    return false
  }
}

export function CardNudge({
  storageKey,
  days = 60,
  className = '',
  children,
}: {
  storageKey: string
  days?: number
  className?: string
  children: React.ReactNode
}) {
  const dismissedStored = useSyncExternalStore(noSubscribe, () => readDismissed(storageKey), () => true)
  const [dismissedNow, setDismissedNow] = useState(false)
  if (dismissedStored || dismissedNow) return null

  function dismiss() {
    setDismissedNow(true)
    try { localStorage.setItem(storageKey, String(Date.now() + days * 86_400_000)) } catch { /* private mode */ }
  }

  return (
    <div className={`fd-fade-in flex items-start gap-3 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={dismiss}
        className="press -my-1 inline-flex shrink-0 items-center min-h-10 px-1 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        Not now
      </button>
    </div>
  )
}
