'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Scales its children down (never up) so they always fit the available zone
 * size without scrollbars.  Runs a cheap DOM measurement after every render;
 * only re-renders when the computed scale changes by > 1%, so no infinite loop.
 */
export function FitContent({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // Runs after every render — measures overflow and adjusts scale.
  // Using no dep array is intentional: when content changes (e.g. a data
  // refresh adds/removes rows) we need to remeasure.
  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const ow = outer.clientWidth
    const oh = outer.clientHeight
    const iw = inner.scrollWidth
    const ih = inner.scrollHeight
    if (!ow || !oh || !iw || !ih) return
    const s = Math.min(1, ow / iw, oh / ih)
    setScale((prev) => (Math.abs(prev - s) < 0.01 ? prev : s))
  })

  return (
    <div ref={outerRef} className="flex-1 overflow-hidden">
      <div
        ref={innerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          // max-content lets the inner div grow to its true natural width so
          // scrollWidth correctly captures horizontal overflow (e.g. bracket
          // columns). min-width: 100% ensures tables still fill the zone when
          // content is narrower than the container.
          width: 'max-content',
          minWidth: '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}
