'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { logout } from '@/actions/auth'

interface Props {
  userName: string | null
  isAdmin: boolean
}

export function NavUserMenu({ userName, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-4 py-1.5 rounded-md font-semibold transition-opacity hover:opacity-90 flex items-center gap-2"
        style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}
      >
        {userName ?? 'My Account'}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1 z-50 text-gray-800 text-sm">
          <Link href="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-2 hover:bg-gray-50">
            Dashboard
          </Link>
          <Link href="/profile" onClick={() => setOpen(false)} className="block px-4 py-2 hover:bg-gray-50">
            My Profile
          </Link>
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)} className="block px-4 py-2 hover:bg-gray-50">
              Admin Panel
            </Link>
          )}
          <div className="border-t my-1" />
          <form action={logout}>
            <button type="submit" className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
