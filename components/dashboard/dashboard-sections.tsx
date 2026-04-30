'use client'

import { useState } from 'react'

export function DashboardSections({
  events,
  games,
  teams,
}: {
  events: React.ReactNode
  games: React.ReactNode
  teams: React.ReactNode | null
}) {
  const sections = [
    { id: 'games', label: 'Upcoming Games' },
    { id: 'events', label: 'My Events' },
    ...(teams ? [{ id: 'teams', label: 'My Teams' }] : []),
  ]

  const [active, setActive] = useState('games')

  return (
    <>
      {/* ── Mobile: section dropdown ── */}
      <div className="md:hidden mb-5">
        <div className="relative">
          <select
            value={active}
            onChange={e => setActive(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-0 cursor-pointer"
          >
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Mobile: show only active section ── */}
      <div className="md:hidden">
        {active === 'games' && <>{games}</>}
        {active === 'events' && <>{events}</>}
        {active === 'teams' && <>{teams}</>}
      </div>

      {/* ── Desktop: original two-column layout ── */}
      <div className="hidden md:block">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {events}
          {games}
        </div>
        {teams && <div className="mt-6">{teams}</div>}
      </div>
    </>
  )
}
