'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { CalendarDays, Trophy, Users, CircleUser } from 'lucide-react'
import { logout } from '@/actions/auth'

interface Props {
  userName: string | null
  isAdmin: boolean
}

const NAV_ITEMS = [
  { href: '/schedule',  label: 'My Games',   Icon: CalendarDays },
  { href: '/my-events', label: 'My Events',  Icon: Trophy       },
  { href: '/my-teams',  label: 'My Teams',   Icon: Users        },
  { href: '/profile',   label: 'My Profile', Icon: CircleUser   },
] as const

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
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border py-1 z-50 text-gray-800 text-sm">
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <Icon className="w-4 h-4 text-gray-400 shrink-0" />
              {label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="border-t my-1" />
              <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin Panel
              </Link>
            </>
          )}
          <div className="border-t my-1" />
          <form action={logout}>
            <button type="submit" className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-red-600">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
