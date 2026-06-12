'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { ChangeMemberRoleForm } from '@/components/admin/change-role-form'
import { MemberActions } from '@/components/admin/member-actions'

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
  /** Transactional SMS reachable (opted in + phone on file). */
  smsTransactional: boolean
  /** Opted in to commercial/promotional SMS for this org. */
  smsPromo: boolean
  /** Transactional email reachable (reminders not disabled + email on file). */
  emailTransactional: boolean
  /** Opted in to commercial/promotional email for this org. */
  emailPromo: boolean
}

export interface LeagueOption {
  id: string
  name: string
}

interface Props {
  players: PlayerRow[]
  leagues: LeagueOption[]
  currentLeague: string | null
  unregisteredOnly: boolean
  isOrgAdmin: boolean
  currentUserId: string | null
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

/**
 * Two small badges showing transactional (game/schedule) and promotional status
 * for a channel. `channel` is only used in the hover tooltips.
 */
function NotifBadges({ transactional, promo, channel }: { transactional: boolean; promo: boolean; channel: 'SMS' | 'Email' }) {
  const reach = channel === 'SMS' ? 'phone' : 'email'
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={transactional ? `Transactional ${channel} on — game & schedule alerts` : `Transactional ${channel} off (or no ${reach})`}
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${transactional ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
      >
        Txn
      </span>
      <span
        title={promo ? `Opted in to promotional ${channel}` : `Not opted in to promotional ${channel}`}
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${promo ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}
      >
        Promo
      </span>
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

export function PlayersClient({ players, leagues, currentLeague, unregisteredOnly, isOrgAdmin, currentUserId }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage] = useState(1)
  const [leaguePending, startLeagueTransition] = useTransition()

  // Instant client-side search + role filter — no server round-trip
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((p) => {
      if (roleFilter && p.role !== roleFilter) return false
      if (!q) return true
      return (
        (p.fullName ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [players, query, roleFilter])

  // Reset to page 1 whenever filters change so stale pages don't linger
  useEffect(() => { setPage(1) }, [query, roleFilter, currentLeague, unregisteredOnly])

  const visiblePlayers = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = visiblePlayers.length < filtered.length

  // Special sentinel value for the "no league" option in the select
  const UNREGISTERED_VALUE = '__unregistered__'

  function setLeague(value: string | null) {
    setQuery('')
    startLeagueTransition(() => {
      if (value === UNREGISTERED_VALUE) {
        router.push('/admin/players?unregistered=1')
      } else {
        router.push(value ? `/admin/players?league=${value}` : '/admin/players')
      }
    })
  }

  const selectValue = unregisteredOnly ? UNREGISTERED_VALUE : (currentLeague ?? '')
  const hasFilters = !!query || !!currentLeague || unregisteredOnly || !!roleFilter

  return (
    <div>
      {/* ── Sticky filter bar ────────────────────────────────────────────── */}
      {/* top-14 clears the fixed mobile admin bar (h-14); lg:top-0 resets for desktop */}
      <div className="sticky top-14 lg:top-0 z-20 bg-[#F8F8F8] -mx-4 px-4 lg:-mx-6 lg:px-6 pt-2 pb-3 border-b border-gray-200 mb-5">

        {/* Search — full width */}
        <div className="relative">
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

        {/* Role + league selects — second row */}
        <div className="flex gap-2 mt-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="flex-1 border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All roles</option>
            <option value="org_admin">Org Admin</option>
            <option value="league_admin">League Admin</option>
            <option value="captain">Captain</option>
            <option value="player">Player</option>
          </select>

          <select
            value={selectValue}
            onChange={(e) => setLeague(e.target.value || null)}
            disabled={leaguePending}
            className={`flex-1 border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent transition-opacity ${leaguePending ? 'opacity-60' : ''}`}
          >
            <option value="">All events</option>
            <option value={UNREGISTERED_VALUE}>Not registered</option>
            {leagues.length > 0 && <option disabled>──────────</option>}
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Result count + clear */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">
            {hasFilters
              ? `${filtered.length} of ${players.length} players`
              : `${players.length} player${players.length !== 1 ? 's' : ''}`}
            {hasMore && ` — showing ${visiblePlayers.length}`}
          </p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setRoleFilter(''); setLeague(null) }}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              Show all
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile: card list ─────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {visiblePlayers.map((player, index) => (
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
                priority={index < 3}
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

        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full py-3 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Load more ({filtered.length - visiblePlayers.length} remaining)
          </button>
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
                <th className="px-4 py-3 font-medium text-gray-500">Notifications</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((player, index) => (
                <tr key={player.memberId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        avatarUrl={player.avatarUrl}
                        name={player.fullName ?? '?'}
                        size="sm"
                        priority={index < 3}
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
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] w-9 text-gray-400">Email</span>
                        <NotifBadges transactional={player.emailTransactional} promo={player.emailPromo} channel="Email" />
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] w-9 text-gray-400">SMS</span>
                        <NotifBadges transactional={player.smsTransactional} promo={player.smsPromo} channel="SMS" />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isOrgAdmin && player.userId !== currentUserId ? (
                      <ChangeMemberRoleForm
                        memberId={player.memberId}
                        currentRole={player.role as 'org_admin' | 'league_admin' | 'captain' | 'player'}
                      />
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[player.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {player.role.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      player.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {player.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {player.userId && (
                        <Link
                          href={`/admin/players/${player.userId}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--brand-primary)' }}
                        >
                          View →
                        </Link>
                      )}
                      {isOrgAdmin && player.userId !== currentUserId && (
                        <MemberActions
                          memberId={player.memberId}
                          memberName={player.fullName ?? player.email ?? 'this player'}
                          status={player.status}
                        />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters ? 'No players match your search.' : 'No players found.'}
                  </td>
                </tr>
              )}
              {hasMore && (
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-center">
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      className="text-sm font-medium hover:underline"
                      style={{ color: 'var(--brand-primary)' }}
                    >
                      Load more ({filtered.length - visiblePlayers.length} remaining)
                    </button>
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

