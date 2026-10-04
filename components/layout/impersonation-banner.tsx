'use client'

import { useTransition } from 'react'
import { exitImpersonation } from '@/actions/platform'

export function ImpersonationBanner({ orgName }: { orgName: string }) {
  const [pending, start] = useTransition()
  return (
    // Phones: in the page flow, just under the fixed admin bar (fixed at the top
    // it covered that bar — menu and Courtside included). Desktop: pinned on top.
    <div className="lg:fixed lg:top-0 lg:inset-x-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-orange-600 text-white text-xs sm:text-sm font-medium">
      <span>Viewing as <strong>{orgName}</strong> (super admin impersonation)</span>
      <button
        onClick={() =>
          start(async () => {
            const result = await exitImpersonation()
            window.location.href = result.redirect
          })
        }
        disabled={pending}
        className="press shrink-0 min-h-9 px-3 rounded bg-white/20 hover:bg-white/30 disabled:opacity-60 text-xs font-semibold"
      >
        {pending ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  )
}
