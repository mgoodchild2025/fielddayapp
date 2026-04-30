'use client'

import { useState, useMemo } from 'react'
import { MarkPaidForm } from '@/components/payments/mark-paid-form'

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
  player: { id: string; full_name: string; email: string } | null
  league: { id: string; name: string; price_cents: number; currency: string } | null
  payment: PaymentRecord | null
  paymentStatus: string
  isFree: boolean
}

type Stats = {
  totalPaidCents: number
  paidCount: number
  unpaidCount: number
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
  unpaid: 'bg-gray-100 text-gray-500',
  free: 'bg-gray-100 text-gray-400',
}

export function PaymentsTable({ rows, stats }: { rows: Row[]; stats: Stats }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')

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

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Collected</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            ${(stats.totalPaidCents / 100).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Paid</p>
          <p className="text-2xl font-bold mt-1">{stats.paidCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Unpaid</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{stats.unpaidCount}</p>
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

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
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
              {filtered.map(r => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.player?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{r.player?.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.league?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">
                    {r.isFree
                      ? <span className="text-gray-400 font-normal">Free</span>
                      : `$${((r.payment?.amount_cents ?? r.league?.price_cents ?? 0) / 100).toFixed(2)} ${(r.payment?.currency ?? r.league?.currency ?? 'cad').toUpperCase()}`
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
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.payment?.paid_at
                      ? new Date(r.payment.paid_at).toLocaleDateString()
                      : new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {(r.paymentStatus === 'unpaid' || r.paymentStatus === 'pending' || r.paymentStatus === 'failed') && r.player && r.league && (
                      <MarkPaidForm
                        registrationId={r.id}
                        userId={r.player.id}
                        leagueId={r.league.id}
                        amountCents={r.league.price_cents}
                        currency={r.league.currency}
                      />
                    )}
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
    </>
  )
}
