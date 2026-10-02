'use client'

import { useState } from 'react'

/**
 * Animated show/hide for expanders ("Show past games", team stats, roster
 * panels): the height eases open/closed (grid-rows 0fr↔1fr, 200ms) instead of
 * jumping and shoving the page under the thumb.
 *
 * Children mount when opening and unmount once the close finishes — same
 * lifecycle as `{open && …}`, so anything that loads on open still does.
 * Interruptible (it's a transition); reduced motion snaps.
 */
export function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-snap motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && !open) setMounted(false) }}
      inert={!open || undefined}
    >
      <div className="min-h-0 overflow-hidden">
        {(open || mounted) && <div className={className}>{children}</div>}
      </div>
    </div>
  )
}
