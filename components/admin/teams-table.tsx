'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type Team = {
  id: string
  name: string
  color: string | null
  status: string | null
  league: { id: string; name: string; slug: string; sport: string | null } | null
  memberCount: number
}

export function TeamsTable({ teams, totalCount }: { teams: Team[]; totalCount: number }) {
  const [search, setSearch] = useState('')
  const [leagueFilter, setLeagueFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const leagues = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of teams) {
      if (t.league) map.set(t.league.id, t.league.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [teams])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return teams.filter(t => {
      if (q && !t.name.toLowerCase().includes(q) && !(t.league?.name ?? '').toLowerCase().includes(q)) return false
      if (leagueFilter !== 'all' && t.league?.id !== leagueFilter) return false
      if (statusFilter !== 'all' && (t.status ?? 'active') !== statusFilter) return false
      return true
    })
  }, [teams, search, leagueFilter, statusFilter])

  const hasFilters = search || leagueFilter !== 'all' || statusFilter !== 'all'

  // Group filtered teams by league
  const grouped = useMemo(() => {
    const map = new Map<string, { league: Team['league']; teams: Team[] }>()
    for (const t of filtered) {
      if (!t.league) continue
      if (!map.has(t.league.id)) map.set(t.league.id, { league: t.league, teams: [] })
      map.get(t.league.id)!.teams.push(t)
    }
    return Array.from(map.values()).sort((a, b) => (a.league?.name ?? '').localeCompare(b.league?.name ?? ''))
  }, [filtered])

  return (
    <>
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teams or events…"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
        />
        <select
          value={leagueFilter}
          onChange={e => setLeagueFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All events</option>
          {leagues.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setLeagueFilter('all'); setStatusFilter('all') }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-md bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {hasFilters && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length} of {totalCount} team{totalCount !== 1 ? 's' : ''}
        </p>
      )}

      {grouped.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
          {hasFilters ? 'No teams match your search.' : 'No teams yet. Teams are created when you set up leagues.'}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ league, teams: leagueTeams }) => (
            <div key={league!.id}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-semibold text-gray-800">{league!.name}</h2>
                {league!.sport && (
                  <span className="text-xs text-gray-500 capitalize">{league!.sport.replace('_', ' ')}</span>
                )}
                <span className="text-xs text-gray-400 ml-1">({leagueTeams.length})</span>
                <Link
                  href={`/admin/events/${league!.slug ?? league!.id}`}
                  className="text-xs hover:underline ml-auto"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  League settings →
                </Link>
              </div>

              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="px-4 py-3 font-medium text-gray-500">Team</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Players</th>
                      <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueTeams.map(team => (
                      <tr key={team.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {team.color && (
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                            )}
                            <Link href={`/teams/${team.id}`} className="font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
                              {team.name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{team.memberCount}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            team.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {team.status ?? 'active'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/teams/${team.id}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
                            Manage →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
