'use client'

import { useState, useMemo, useEffect } from 'react'
import { MarkPaidForm } from '@/components/payments/mark-paid-form'
import { EditPaymentForm } from '@/components/payments/edit-payment-form'

const PAGE_SIZE = 25

type PaymentRecord = {
  id: string
  amount_cents: number
  currency: string
  status: string
  payment_method: string | null
  paid_at: string | null
  notes: string | null
}

type Row = {
  id: string
  created_at: string
  registration_type?: string | null
  player: { id: string; full_name: string; email: string } | null
  league: { id: string; name: string; price_cents: number; drop_in_price_cents?: number | null; currency: string; payment_mode?: string } | null
  payment: PaymentRecord | null
  paymentStatus: string
  isFree: boolean
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
  unpaid: 'bg-gray-100 text-gray-500',
  free: 'bg-gray-100 text-gray-400',
}

function effectivePriceCents(r: Row): number {
  if (r.payment?.amount_cents != null) return r.payment.amount_cents
  if (!r.league) return 0
  return r.registration_type === 'drop_in'
    ? (r.league.drop_in_price_cents ?? r.league.price_cents)
    : r.league.price_cents
}

function amountLabel(r: Row) {
  if (r.isFree) return 'Free'
  const cents = effectivePriceCents(r)
  const currency = (r.payment?.currency ?? r.league?.currency ?? 'cad').toUpperCase()
  return `$${(cents / 100).toFixed(2)} ${currency}`
}

function dateLabel(r: Row) {
  const d = r.payment?.paid_at ?? r.created_at
  return new Date(d).toLocaleDateString()
}

function needsAction(r: Row) {
  return (r.paymentStatus === 'unpaid' || r.paymentStatus === 'pending' || r.paymentStatus === 'failed')
    && !!r.player && !!r.league
}

const VALID_METHODS = ['cash', 'etransfer', 'cheque', 'stripe', 'card', 'other'] as const
function defaultPayStatus(s?: string | null): 'paid' | 'pending' | 'refunded' {
  return s === 'pending' ? 'pending' : s === 'refunded' ? 'refunded' : 'paid'
}
function defaultPayMethod(m?: string | null): (typeof VALID_METHODS)[number] {
  return (VALID_METHODS as readonly string[]).includes(m ?? '') ? (m as (typeof VALID_METHODS)[number]) : 'etransfer'
}

function hasPaymentAction(r: Row, isOrgAdmin: boolean) {
  if (!isOrgAdmin || !r.league) return false
  if (r.league.payment_mode === 'per_team') return needsAction(r) && !!r.player
  return true
}

/** Org-admin payment control: per-team events keep the (team-aware) Mark-as-Paid
 *  flow; per-player events get the editable form that also handles free events. */
function PaymentAction({ r, isOrgAdmin }: { r: Row; isOrgAdmin: boolean }) {
  if (!isOrgAdmin || !r.league) return null
  if (r.league.payment_mode === 'per_team') {
    if (!needsAction(r) || !r.player) return null
    return (
      <MarkPaidForm
        registrationId={r.id}
        userId={r.player.id}
        leagueId={r.league.id}
        amountCents={r.registration_type === 'drop_in' ? (r.league.drop_in_price_cents ?? r.league.price_cents) : r.league.price_cents}
        currency={r.league.currency}
      />
    )
  }
  return (
    <EditPaymentForm
      registrationId={r.id}
      hasPayment={!!r.payment}
      defaultAmountCents={effectivePriceCents(r)}
      defaultStatus={defaultPayStatus(r.payment?.status)}
      defaultMethod={defaultPayMethod(r.payment?.payment_method)}
      defaultNotes={r.payment?.notes}
    />
  )
}

export function PaymentsTable({ rows, isOrgAdmin = true }: { rows: Row[]; isOrgAdmin?: boolean }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [page, setPage] = useState(1)

  const events = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      if (r.league) map.set(r.league.id, r.league.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r => {
      if (q) {
        const playerMatch = (r.player?.full_name ?? '').toLowerCase().includes(q)
          || (r.player?.email ?? '').toLowerCase().includes(q)
        const eventMatch = (r.league?.name ?? '').toLowerCase().includes(q)
        if (!playerMatch && !eventMatch) return false
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'unpaid' && r.paymentStatus !== 'unpaid' && r.paymentStatus !== 'pending') return false
        if (statusFilter !== 'unpaid' && r.paymentStatus !== statusFilter) return false
      }
      if (eventFilter !== 'all' && r.league?.id !== eventFilter) return false
      return true
    })
  }, [rows, search, statusFilter, eventFilter])

  const hasFilters = search || statusFilter !== 'all' || eventFilter !== 'all'

  // Stats derived from the filtered set so they react to search/filter changes
  const filteredStats = useMemo(() => ({
    totalPaidCents: filtered
      .filter(r => r.payment?.status === 'paid')
      .reduce((sum, r) => sum + (r.payment?.amount_cents ?? 0), 0),
    paidCount: filtered.filter(r => r.paymentStatus === 'paid').length,
    unpaidCount: filtered.filter(r => r.paymentStatus === 'unpaid').length,
  }), [filtered])

  // Reset to page 1 whenever the filters change so stale pages don't linger
  useEffect(() => { setPage(1) }, [search, statusFilter, eventFilter])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs sm:text-sm text-gray-500">Total Collected</p>
          <p className="text-xl sm:text-2xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            ${(filteredStats.totalPaidCents / 100).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs sm:text-sm text-gray-500">Paid</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{filteredStats.paidCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs sm:text-sm text-gray-500">Unpaid</p>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-amber-600">{filteredStats.unpaidCount}</p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player or event…"
          className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid / Pending</option>
          <option value="free">Free</option>
          <option value="refunded">Refunded</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All events</option>
          {events.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setEventFilter('all') }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-md bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {hasFilters && (
        <p className="text-xs text-gray-400 mb-3">
          {filtered.length} of {rows.length} registration{rows.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Desktop table (md+) ── */}
      <div className="hidden md:block bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Player</th>
                <th className="px-4 py-3 font-medium text-gray-500">Event</th>
                <th className="px-4 py-3 font-medium text-gray-500">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Method</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.player?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{r.player?.email ?? '—'}</p>
                    {r.registration_type === 'drop_in' && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        Drop-in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.league?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">
                    {r.isFree
                      ? <span className="text-gray-400 font-normal">Free</span>
                      : amountLabel(r)
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[r.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-xs">
                    {r.payment?.payment_method ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{dateLabel(r)}</td>
                  <td className="px-4 py-3">
                    <PaymentAction r={r} isOrgAdmin={isOrgAdmin} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters ? 'No registrations match your search.' : 'No registrations found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards (below md) ── */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border p-10 text-center text-gray-400 text-sm">
            {hasFilters ? 'No registrations match your search.' : 'No registrations found.'}
          </div>
        ) : (
          visible.map(r => (
            <div key={r.id} className="bg-white rounded-lg border p-4">
              {/* Top row: name + status badge */}
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.player?.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{r.player?.email ?? '—'}</p>
                  {r.registration_type === 'drop_in' && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      Drop-in
                    </span>
                  )}
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[r.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                  {r.paymentStatus}
                </span>
              </div>

              {/* Event + amount row */}
              <div className="flex items-center justify-between mt-2">
                <p className="text-sm text-gray-600 truncate mr-3">{r.league?.name ?? '—'}</p>
                <p className={`text-sm font-semibold shrink-0 ${r.isFree ? 'text-gray-400 font-normal' : ''}`}>
                  {amountLabel(r)}
                </p>
              </div>

              {/* Secondary details */}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                {r.payment?.payment_method && (
                  <span className="capitalize">{r.payment.payment_method}</span>
                )}
                <span>{dateLabel(r)}</span>
              </div>

              {/* Action */}
              {hasPaymentAction(r, isOrgAdmin) && (
                <div className="mt-3 pt-3 border-t">
                  <PaymentAction r={r} isOrgAdmin={isOrgAdmin} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors bg-white"
          >
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      )}
      {filtered.length > PAGE_SIZE && (
        <p className="mt-2 text-center text-xs text-gray-400">
          Showing {visible.length} of {filtered.length}
        </p>
      )}
    </>
  )
}
