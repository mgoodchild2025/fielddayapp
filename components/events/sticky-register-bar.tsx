'use client'

import Link from 'next/link'

export function StickyRegisterBar({
  href,
  label,
  price,
}: {
  href: string
  label: string
  price?: string | null
}) {
  return (
    // data-above-tab-bar: when the logged-in tab bar is also on screen,
    // globals.css stacks this bar directly above it (both are pinned to the
    // bottom; without that the tab bar covered the Register button).
    <div data-above-tab-bar="" className="fd-bar-light fd-register-bar md:hidden fixed bottom-0 inset-x-0 z-50">
      <div className="fd-register-bar__inner flex items-center gap-4 px-4 pt-3 max-w-3xl mx-auto">
        {price && (
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
              Registration open
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">{price}</p>
          </div>
        )}
        <Link
          href={href}
          className="press shrink-0 px-5 py-2.5 rounded-md font-bold text-sm text-white tracking-wide uppercase hover:opacity-90"
          style={{
            backgroundColor: 'var(--brand-primary)',
            fontFamily: 'var(--brand-heading-font)',
          }}
        >
          {label}
        </Link>
      </div>
    </div>
  )
}
