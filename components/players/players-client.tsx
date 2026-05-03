'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { DeletePlayerButton } from '@/components/players/delete-player-button'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlayerRow {
  memberId: string
  userId: string | null
  role: string
  status: string
  fullName: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
}

export interface LeagueOption {
  id: string
  name: string
}

interface Props {
  players: PlayerRow[]
  leagues: LeagueOption[]
  currentLeague: string | null
  isOrgAdmin: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  org_admin: 'bg-purple-100 text-purple-700',
  league_admin: 'bg-blue-100 text-blue-700',
  captain: 'bg-orange-100 text-orange-700',
  player: 'bg-gray-100 text-gray-600',
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlayersClient({ players, leagues, currentLeague, isOrgAdmin }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [leaguePending, startLeagueTransition] = useTransition()

  // Instant client-side search — no server round-trip
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) =>
      (p.fullName ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    )
  }, [players, query])

  function setLeague(id: string | null) {
    setQuery('') // reset search when switching league
    startLeagueTransition(() => {
      router.push(id ? `/admin/players?league=${id}` : '/admin/players')
    })
  }

  const hasFilters = !!query || !!currentLeague

  return (
    <div>
      {/* ── Sticky filter bar ────────────────────────────────────────────── */}
      {/* top-14 clears the fixed mobile admin bar (h-14); lg:top-0 resets for desktop */}
      <div className="sticky top-14 lg:top-0 z-20 bg-[#F8F8F8] -mx-4 px-4 lg:-mx-6 lg:px-6 pt-2 pb-3 border-b border-gray-200 mb-5">

        {/* Search + league select — single row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            />
          </div>

          {leagues.length > 0 && (
            <select
              value={currentLeague ?? ''}
              onChange={(e) => setLeague(e.target.value || null)}
              disabled={leaguePending}
              className={`shrink-0 border border-gray-200 bg-white rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent transition-opacity ${leaguePending ? 'opacity-60' : ''}`}
            >
              <option value="">All leagues</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Result count + clear */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">
            {hasFilters
              ? `${filtered.length} of ${players.length} players`
              : `${players.length} player${players.length !== 1 ? 's' : ''}`}
          </p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setLeague(null) }}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile: card list ─────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.map((player) => (
          <div key={player.memberId} className="bg-white rounded-lg border overflow-hidden">
            {/* Card body — taps through to player detail */}
            <Link
              href={player.userId ? `/admin/players/${player.userId}` : '#'}
              className="flex items-center gap-3 px-4 py-3"
            >
              <PlayerAvatar
                avatarUrl={player.avatarUrl}
                name={player.fullName ?? '?'}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-gray-900 truncate">
                  {player.fullName ?? '—'}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {player.email ?? '—'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[player.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {player.role.replace(/_/g, ' ')}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  player.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                  {player.status}
                </span>
              </div>
            </Link>

            {/* Action strip */}
            <div className="border-t flex divide-x divide-gray-100">
              {player.phone && (
                <a
                  href={`tel:${player.phone}`}
                  className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <PhoneIcon />
                  Call
                </a>
              )}
              {player.email && (
                <a
                  href={`mailto:${player.email}`}
                  className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <MailIcon />
                  Email
                </a>
              )}
              {player.userId && (
                <Link
                  href={`/admin/players/${player.userId}`}
                  className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  View
                  <ArrowIcon />
                </Link>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="bg-white rounded-lg border px-4 py-12 text-center text-sm text-gray-400">
            {hasFilters ? 'No players match your search.' : 'No players found.'}
          </div>
        )}
      </div>

      {/* ── Desktop: table ────────────────────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr key={player.memberId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        avatarUrl={player.avatarUrl}
                        name={player.fullName ?? '?'}
                        size="sm"
                      />
                      {player.userId ? (
                        <Link
                          href={`/admin/players/${player.userId}`}
                          className="hover:underline"
                          style={{ color: 'var(--brand-primary)' }}
                        >
                          {player.fullName ?? '—'}
                        </Link>
                      ) : (player.fullName ?? '—')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{player.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{player.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[player.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {player.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      player.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {player.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {player.userId && (
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Link
                          href={`/admin/players/${player.userId}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--brand-primary)' }}
                        >
                          View →
                        </Link>
                        {isOrgAdmin && (
                          <DeletePlayerButton
                            userId={player.userId}
                            name={player.fullName ?? player.email ?? 'this player'}
                          />
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters ? 'No players match your search.' : 'No players found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

