'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/actions/auth'

interface Props {
  userName: string | null
  isAdmin: boolean
}

export function MobileNav({ userName, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Prevent body scroll + iOS right-edge viewport expansion when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    document.documentElement.style.overflowX = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflowX = ''
    }
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="md:hidden p-2 rounded opacity-80 hover:opacity-100 transition-opacity"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer — slides from right. overflowX:hidden on <html> prevents iOS Safari viewport expansion. */}
      <div
        className={`fixed top-0 right-0 h-full w-72 z-50 flex flex-col md:hidden transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
          <button onClick={() => setOpen(false)} className="p-1 opacity-70 hover:opacity-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="font-semibold text-sm">Menu</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {userName && (
            <Link
              href="/events"
              className="block px-4 py-3 rounded-lg text-sm font-medium opacity-80 hover:opacity-100 hover:bg-white/10 transition-colors"
            >
              Events
            </Link>
          )}

          <div className="border-t border-white/10 my-4" />

          {userName ? (
            <>
              <Link href="/dashboard" className="block px-4 py-3 rounded-lg text-sm font-medium opacity-80 hover:opacity-100 hover:bg-white/10 transition-colors">
                Dashboard
              </Link>
              <Link href="/profile" className="block px-4 py-3 rounded-lg text-sm font-medium opacity-80 hover:opacity-100 hover:bg-white/10 transition-colors">
                My Profile
              </Link>
              {isAdmin && (
                <Link href="/admin" className="block px-4 py-3 rounded-lg text-sm font-medium opacity-80 hover:opacity-100 hover:bg-white/10 transition-colors">
                  Admin Panel
                </Link>
              )}
              <div className="border-t border-white/10 my-4" />
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-red-300 hover:bg-white/10 transition-colors"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="block px-4 py-3 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </>
  )
}
