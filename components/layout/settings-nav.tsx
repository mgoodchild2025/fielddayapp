'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { SETTINGS_GROUPS, SETTINGS_CATEGORIES } from '@/lib/settings-categories'

/**
 * Category switcher on settings sub-pages: a way back to the full list, plus a
 * select for jumping straight to another category. The landing page
 * (/admin/settings) is itself the list, so this stays out of the way there.
 */
export function SettingsNav() {
  const router = useRouter()
  const pathname = usePathname()

  if (pathname === '/admin/settings') return null

  const current = SETTINGS_CATEGORIES.find(c => pathname === c.href || pathname.startsWith(c.href + '/')) ?? null

  return (
    <div className="mb-8">
      <Link
        href="/admin/settings"
        className="press inline-flex items-center gap-1 min-h-10 -ml-1 pr-2 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        All settings
      </Link>

      <div className="relative mt-1">
        <select
          aria-label="Settings category"
          value={current?.href ?? ''}
          onChange={e => { if (e.target.value) router.push(e.target.value) }}
          className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 cursor-pointer"
        >
          <option value="" disabled>Select a category…</option>
          {SETTINGS_GROUPS.map(g => (
            <optgroup key={g.title} label={g.title}>
              {g.items.map(c => (
                <option key={c.href} value={c.href}>{c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {current?.description && (
        <p className="mt-2 text-xs text-gray-500">{current.description}</p>
      )}

      <hr className="mt-6 border-gray-100" />
    </div>
  )
}
