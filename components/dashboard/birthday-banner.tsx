'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfettiBurst, makeConfetti, type ConfettiPiece } from '@/components/medals/medal-case'

/**
 * "Happy birthday, Sam! 🎂" on the player's own dashboard on their birthday
 * (org calendar day). Confetti once per birthday per device.
 */
export function BirthdayBanner({ firstName, orgName, storageKey }: { firstName: string; orgName: string; storageKey: string }) {
  const [confetti, setConfetti] = useState<ConfettiPiece[] | null>(null)

  useEffect(() => {
    // One celebration per birthday (the key carries the year).
    const key = `${storageKey}:${new Date().getFullYear()}`
    let seen = false
    try { seen = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1') } catch { /* private mode */ }
    if (seen) return
    const show = setTimeout(() => setConfetti(makeConfetti()), 0)
    const hide = setTimeout(() => setConfetti(null), 3500)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [storageKey])

  return (
    <div className="mt-3 rounded-xl border border-pink-200 bg-gradient-to-r from-pink-50 to-amber-50 px-4 py-3">
      <p className="text-base font-bold text-gray-900">Happy birthday, {firstName}! 🎂</p>
      <p className="text-sm text-gray-700">From everyone at {orgName}. Hope you get a win today 🎉</p>
      {confetti && createPortal(
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
          <ConfettiBurst pieces={confetti} />
        </div>,
        document.body,
      )}
    </div>
  )
}
