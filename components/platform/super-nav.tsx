'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const LINKS = [
  { href: '/super', label: 'Organizations' },
  { href: '/super/settings', label: 'Settings' },
  { href: '/super/settings/plans', label: 'Plan Config' },
  { href: '/super/legal', label: 'Legal Docs' },
  { href: '/super/compliance', label: 'Compliance' },
]

export function SuperNav({ email, stripeTest }: { email: string; stripeTest: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <nav className="bg-gray-900 border-b border-gray-800 text-white">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/Fieldday-Icon.png" alt="Fieldday" width={28} height={28} className="rounded shrink-0" />
          <span className="text-xs text-gray-400 uppercase tracking-widest font-medium hidden sm:inline">Platform Admin</span>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-5 ml-2">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
            {stripeTest && (
              <Link href="/super/settings" className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500 text-white">
                Stripe Test
              </Link>
            )}
          </div>
        </div>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-4 text-sm shrink-0">
          <span className="text-gray-400 truncate max-w-[180px]">{email}</span>
          <a href="/login" className="text-gray-400 hover:text-white">Sign out</a>
        </div>

        {/* Mobile: test chip + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {stripeTest && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500 text-white">Test</span>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="p-2 -mr-2 text-gray-300 hover:text-white"
          >
            {open ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-800 px-4 py-2 space-y-0.5">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-2 py-2.5 rounded-md text-sm text-gray-300 hover:text-white hover:bg-gray-800"
            >
              {l.label}
            </Link>
          ))}
          <div className="border-t border-gray-800 mt-1 pt-2 flex items-center justify-between px-2 py-1.5">
            <span className="text-xs text-gray-500 truncate max-w-[200px]">{email}</span>
            <a href="/login" className="text-sm text-gray-300 hover:text-white">Sign out</a>
          </div>
        </div>
      )}
    </nav>
  )
}
