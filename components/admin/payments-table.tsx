'use client'

import { useState, useMemo, useEffect } from 'react'
import { EditPaymentForm } from '@/components/payments/edit-payment-form'
import { StatusChip } from '@/components/ui/status-chip'
import { collectedTotals, outstandingTotals } from '@/lib/payment-ledger'
import type { OrgTaxRate } from '@/lib/tax'

const PAGE_SIZE = 25

type PaymentRecord = {
  id: string
  amount_cents: number
  refunded_cents?: number | null
  tax_cents?: number
  currency: string
  status: string
  payment_method: string | null
  paid_at: string | null
  notes: string | null
  discountCode?: string | null
  discountCents?: number
}

/** "SAVE10 (−$5.00)" when a discount was applied to this payment. */
function discountLabel(r: Row): string | null {
  const cents = r.payment?.discountCents ?? 0
  const code = r.payment?.discountCode
  if (!code && cents <= 0) return null
  const amount = cents > 0 ? ` (−$${(cents / 100).toFixed(2)})` : ''
  return `${code ?? 'Discount'}${amount}`
}

type Row = {
  id: string
  created_at: string
  registration_type?: string | null
  player: { id: string; full_name: string; email: string } | null
  league: { id: string; name: string; price_cents: number; drop_in_price_cents?: number | null; currency: string; payment_mode?: string } | null
  payment: PaymentRecord | null
  /** Per-team ledger rows: the TEAM that owes/paid the fee (player is null). */
  teamId?: string | null
  teamName?: string | null
  paymentStatus: string
  isFree: boolean
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
  const refunded = r.payment?.refunded_cents ?? 0
  return `$${(cents / 100).toFixed(2)} ${currency}${refunded > 0 ? ` (−$${(refunded / 100).toFixed(2)} refunded)` : ''}`
}

function dateLabel(r: Row) {
  const d = r.payment?.paid_at ?? r.created_at
  return new Date(d).toLocaleDateString()
}

const VALID_METHODS = ['cash', 'etransfer', 'cheque', 'stripe', 'card', 'other'] as const
function defaultPayStatus(s?: string | null): 'paid' | 'pending' | 'refunded' {
  return s === 'pending' ? 'pending' : s === 'refunded' ? 'refunded' : 'paid'
}
function defaultPayMethod(m?: string | null): (typeof VALID_METHODS)[number] {
  return (VALID_METHODS as readonly string[]).includes(m ?? '') ? (m as (typeof VALID_METHODS)[number]) : 'etransfer'
}

/** Per-team events are paid by the TEAM: its ledger row edits the team fee,
 *  and member rows (kept only when they carry a payment of their own) stay
 *  read-only. Everything else edits the registration's payment. */
function editTarget(r: Row): { registrationId: string } | { teamId: string; leagueId: string } | null {
  if (!r.league) return null
  if (r.league.payment_mode === 'per_team') return r.teamId ? { teamId: r.teamId, leagueId: r.league.id } : null
  return { registrationId: r.id }
}

/** The payment status pill. For org admins it opens the payment editor —
 *  the one control for recording, editing, and refunding, for players and
 *  teams alike (mirrors the event registrations screen). */
function StatusBadge({ r, isOrgAdmin, className = '' }: { r: Row; isOrgAdmin: boolean; className?: string }) {
  const badge = <StatusChip status={r.paymentStatus} className={className} />
  const target = isOrgAdmin ? editTarget(r) : null
  if (!target) return badge
  return (
    <EditPaymentForm
      {...target}
      hasPayment={!!r.payment}
      defaultAmountCents={effectivePriceCents(r)}
      defaultStatus={defaultPayStatus(r.payment?.status)}
      defaultMethod={defaultPayMethod(r.payment?.payment_method)}
      defaultNotes={r.payment?.notes}
      defaultRefundCents={r.payment?.refunded_cents}
      trigger={badge}
    />
  )
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** A summary card that doubles as a status filter: tap to show only those
 *  rows, tap again to show everything. */
function FilterCard({ label, active, tone, onToggle, children }: {
  label: string
  active: boolean
  tone: 'paid' | 'unpaid'
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? 'Showing only these — click to show all' : `Show only ${tone} registrations`}
      className={`bg-white rounded-lg border p-4 text-left transition-colors hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
        active && tone === 'unpaid' ? 'ring-2 ring-amber-400 border-amber-400' : ''
      }`}
      style={active && tone === 'paid' ? { boxShadow: '0 0 0 2px var(--brand-primary)', borderColor: 'var(--brand-primary)' } : undefined}
    >
      <p className="text-xs sm:text-sm text-gray-500">{label}</p>
      {children}
    </button>
  )
}

export function PaymentsTable({ rows, isOrgAdmin = true, taxRates = [] }: { rows: Row[]; isOrgAdmin?: boolean; taxRates?: OrgTaxRate[] }) {
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
          || (r.teamName ?? '').toLowerCase().includes(q)
        const eventMatch = (r.league?.name ?? '').toLowerCase().includes(q)
        if (!playerMatch && !eventMatch) return false
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'unpaid' && r.paymentStatus !== 'unpaid' && r.paymentStatus !== 'pending' && r.paymentStatus !== 'failed') return false
        if (statusFilter !== 'unpaid' && r.paymentStatus !== statusFilter) return false
      }
      if (eventFilter !== 'all' && r.league?.id !== eventFilter) return false
      return true
    })
  }, [rows, search, statusFilter, eventFilter])

  const hasFilters = search || statusFilter !== 'all' || eventFilter !== 'all'

  // Stats derived from the filtered set so they react to search/filter changes
  const filteredStats = useMemo(() => ({
    // Paid, manual, and refunded payments net of refunds — the same rule as
    // the finance reports (see lib/payment-ledger).
    collected: collectedTotals(filtered),
    paidCount: filtered.filter(r => r.paymentStatus === 'paid').length,
    // "Unpaid" = anything still owed: unpaid, pending, or failed — with the
    // amount owed, tax included (see lib/payment-ledger).
    outstanding: outstandingTotals(filtered, taxRates),
  }), [filtered, taxRates])

  const toggleStatus = (status: 'paid' | 'unpaid') =>
    setStatusFilter(current => (current === status ? 'all' : status))

  // Reset to page 1 whenever the filters change so stale pages don't linger
  useEffect(() => { setPage(1) }, [search, statusFilter, eventFilter])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  return (
    <>
      {/* Stats — each card also filters the list to its rows */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <FilterCard label="Total Collected" tone="paid" active={statusFilter === 'paid'} onToggle={() => toggleStatus('paid')}>
          <p className="text-xl sm:text-2xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            {money(filteredStats.collected.totalCents)}
          </p>
          {filteredStats.collected.taxCents > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5">incl. {money(filteredStats.collected.taxCents)} tax</p>
          )}
        </FilterCard>
        <FilterCard label="Total Unpaid" tone="unpaid" active={statusFilter === 'unpaid'} onToggle={() => toggleStatus('unpaid')}>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-amber-600">{money(filteredStats.outstanding.totalCents)}</p>
          {filteredStats.outstanding.taxCents > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5">incl. {money(filteredStats.outstanding.taxCents)} tax</p>
          )}
        </FilterCard>
        <FilterCard label="Paid" tone="paid" active={statusFilter === 'paid'} onToggle={() => toggleStatus('paid')}>
          <p className="text-xl sm:text-2xl font-bold mt-1">{filteredStats.paidCount}</p>
        </FilterCard>
        <FilterCard label="Unpaid" tone="unpaid" active={statusFilter === 'unpaid'} onToggle={() => toggleStatus('unpaid')}>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-amber-600">{filteredStats.outstanding.count}</p>
        </FilterCard>
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
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.player?.full_name ?? r.teamName ?? '—'}</p>
                    <p className="text-xs text-gray-500">{r.teamName && !r.player ? 'Team fee' : (r.player?.email ?? '—')}</p>
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
                    {discountLabel(r) && (
                      <span className="block text-xs font-normal text-green-600 mt-0.5">🏷 {discountLabel(r)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge r={r} isOrgAdmin={isOrgAdmin} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-xs">
                    {r.payment?.payment_method ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{dateLabel(r)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
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
                  <p className="font-semibold truncate">{r.player?.full_name ?? r.teamName ?? '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{r.teamName && !r.player ? 'Team fee' : (r.player?.email ?? '—')}</p>
                  {r.registration_type === 'drop_in' && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      Drop-in
                    </span>
                  )}
                </div>
                <StatusBadge r={r} isOrgAdmin={isOrgAdmin} className="shrink-0" />
              </div>

              {/* Event + amount row */}
              <div className="flex items-center justify-between mt-2">
                <p className="text-sm text-gray-600 truncate mr-3">{r.league?.name ?? '—'}</p>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold ${r.isFree ? 'text-gray-400 font-normal' : ''}`}>
                    {amountLabel(r)}
                  </p>
                  {discountLabel(r) && <p className="text-xs text-green-600">🏷 {discountLabel(r)}</p>}
                </div>
              </div>

              {/* Secondary details */}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                {r.payment?.payment_method && (
                  <span className="capitalize">{r.payment.payment_method}</span>
                )}
                <span>{dateLabel(r)}</span>
              </div>

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
