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
    <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-2xl">
      <div
        className="flex items-center gap-4 px-4 py-3 max-w-3xl mx-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        {price && (
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
              Registration open
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">{price}</p>
          </div>
        )}
        <Link
          href={href}
          className="shrink-0 px-5 py-2.5 rounded-md font-bold text-sm text-white tracking-wide uppercase transition-opacity hover:opacity-90 active:opacity-75"
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
