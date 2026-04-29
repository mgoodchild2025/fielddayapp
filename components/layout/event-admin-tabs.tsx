'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function tabs(id: string, eventType: string) {
  const isSessionBased = eventType === 'pickup' || eventType === 'drop_in'
  const base = [
    { label: 'Overview', href: `/admin/events/${id}` },
    { label: 'Registrations', href: `/admin/events/${id}/registrations` },
  ]
  if (isSessionBased) {
    return [...base, { label: 'Sessions', href: `/admin/events/${id}/sessions` }]
  }
  return [
    ...base,
    { label: 'Teams', href: `/admin/events/${id}/teams` },
    { label: 'Schedule', href: `/admin/events/${id}/schedule` },
  ]
}

export function EventAdminTabs({ leagueId, eventType }: { leagueId: string; eventType: string }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 border-b mb-6 overflow-x-auto scrollbar-none -mx-1 px-1">
      {tabs(leagueId, eventType).map((tab) => {
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
