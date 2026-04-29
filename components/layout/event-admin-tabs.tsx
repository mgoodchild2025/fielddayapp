'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = (id: string) => [
  { label: 'Overview', href: `/admin/events/${id}` },
  { label: 'Registrations', href: `/admin/events/${id}/registrations` },
  { label: 'Teams', href: `/admin/events/${id}/teams` },
  { label: 'Schedule', href: `/admin/events/${id}/schedule` },
]

export function EventAdminTabs({ leagueId }: { leagueId: string }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 border-b mb-6 overflow-x-auto scrollbar-none -mx-1 px-1">
      {tabs(leagueId).map((tab) => {
        const isActive =
          tab.href === `/admin/events/${leagueId}`
            ? pathname === tab.href
            : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
