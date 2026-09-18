import Link from 'next/link'

/**
 * Shared nav across a team's four pages. They existed with almost no links
 * between them — the stats page in particular had no way back to the team at
 * all, so arriving from a dashboard link was a dead end.
 */
const TABS = [
  { key: 'team', label: 'Team', href: (id: string) => `/teams/${id}` },
  { key: 'stats', label: 'Stats', href: (id: string) => `/teams/${id}/stats` },
  { key: 'schedule', label: 'Schedule', href: (id: string) => `/teams/${id}/schedule` },
  { key: 'cards', label: 'Cards', href: (id: string) => `/teams/${id}/cards` },
] as const

export type TeamPageKey = (typeof TABS)[number]['key']

export function TeamPageNav({ teamId, active }: { teamId: string; active: TeamPageKey }) {
  return (
    <nav className="mt-4 flex gap-1 border-b border-gray-200 overflow-x-auto">
      {TABS.map((t) => {
        const isActive = t.key === active
        return (
          <Link
            key={t.key}
            href={t.href(teamId)}
            aria-current={isActive ? 'page' : undefined}
            className={`px-3 sm:px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              isActive
                ? 'border-[var(--brand-primary)] text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
