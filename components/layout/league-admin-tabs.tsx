'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = (id: string) => [
  { label: 'Overview', href: `/admin/leagues/${id}` },
  { label: 'Registrations', href: `/admin/leagues/${id}/registrations` },
  { label: 'Teams', href: `/admin/leagues/${id}/teams` },
  { label: 'Schedule', href: `/admin/leagues/${id}/schedule` },
]

export function LeagueAdminTabs({ leagueId }: { leagueId: string }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 border-b mb-6">
      {tabs(leagueId).map((tab) => {
        const isActive =
          tab.href === `/admin/leagues/${leagueId}`
            ? pathname === tab.href
            : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
