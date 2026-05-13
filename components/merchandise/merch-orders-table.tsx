'use client'

import { useState, useTransition } from 'react'
import { fulfillMerchandiseOrder, fulfillAllMerchandiseOrders, fulfillAllShopOrders, fulfillAllOrgOrders, markMerchandiseOrderPaid } from '@/actions/merchandise'
import type { MerchOrder } from '@/actions/merchandise'

type FulfillAllTarget =
  | { type: 'league'; leagueId: string }
  | { type: 'shop'; orgId: string }
  | { type: 'all'; orgId: string }

interface Props {
  fulfillAllTarget: FulfillAllTarget
  orders: MerchOrder[]
  showSource?: boolean
  isManualPayment?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  paid: 'bg-blue-100 text-blue-700',
  fulfilled: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function SourceBadge({ leagueName }: { leagueName?: string | null }) {
  if (!leagueName) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Shop
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-500 bg-gray-100 max-w-[140px] truncate" title={leagueName}>
      {leagueName}
    </span>
  )
}

export function MerchandiseOrdersTable({ fulfillAllTarget, orders: initialOrders, showSource = false, isManualPayment = false }: Props) {
  const [orders, setOrders] = useState<MerchOrder[]>(initialOrders)
  const [error, setError] = useState<string | null>(null)
  const [fulfillPendingId, setFulfillPendingId] = useState<string | null>(null)
  const [fulfillAllPending, setFulfillAllPending] = useState(false)
  const [markPaidOpenId, setMarkPaidOpenId] = useState<string | null>(null)
  const [markPaidMethod, setMarkPaidMethod] = useState<'etransfer' | 'cash'>('etransfer')
  const [markPaidNotes, setMarkPaidNotes] = useState('')
  const [markPaidPendingId, setMarkPaidPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const paidOrders = orders.filter((o) => o.status === 'paid')

  function handleFulfill(orderId: string) {
    setError(null)
    setFulfillPendingId(orderId)
    startTransition(async () => {
      const result = await fulfillMerchandiseOrder(orderId)
      setFulfillPendingId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status: 'fulfilled', fulfilled_at: new Date().toISOString() } : o)
        )
      }
    })
  }

  function handleFulfillAll() {
    setError(null)
    setFulfillAllPending(true)
    startTransition(async () => {
      let result: { error: string | null }
      if (fulfillAllTarget.type === 'all') {
        result = await fulfillAllOrgOrders(fulfillAllTarget.orgId)
      } else if (fulfillAllTarget.type === 'shop') {
        result = await fulfillAllShopOrders(fulfillAllTarget.orgId)
      } else {
        result = await fulfillAllMerchandiseOrders(fulfillAllTarget.leagueId)
      }
      setFulfillAllPending(false)
      if (result.error) {
        setError(result.error)
      } else {
        setOrders((prev) =>
          prev.map((o) => o.status === 'paid' ? { ...o, status: 'fulfilled', fulfilled_at: new Date().toISOString() } : o)
        )
      }
    })
  }

  function handleMarkPaid(orderId: string) {
    setError(null)
    setMarkPaidPendingId(orderId)
    startTransition(async () => {
      const result = await markMerchandiseOrderPaid(orderId, {
        method: markPaidMethod,
        notes: markPaidNotes || undefined,
      })
      setMarkPaidPendingId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setOrders((prev) =>
          prev.map((o) => o.id === orderId ? { ...o, status: 'paid' } : o)
        )
        setMarkPaidOpenId(null)
        setMarkPaidNotes('')
        setMarkPaidMethod('etransfer')
      }
    })
  }

  function handleExportCsv() {
    const exportable = orders.filter((o) => o.status !== 'cancelled')
    if (exportable.length === 0) return

    const headerRow = showSource
      ? ['Source', 'Player Name', 'Email', 'Item', 'Size / Variant', 'Qty', 'Unit Price', 'Total', 'Status']
      : ['Player Name', 'Email', 'Item', 'Size / Variant', 'Qty', 'Unit Price', 'Total', 'Status']

    const rows = exportable.map((o) => {
      const base = [
        o.player_name ?? '',
        o.player_email ?? '',
        o.item_name ?? '',
        o.variant_label ?? '',
        String(o.quantity),
        `$${(o.unit_price_cents / 100).toFixed(2)}`,
        `$${((o.unit_price_cents * o.quantity) / 100).toFixed(2)}`,
        o.status,
      ]
      return showSource ? [o.league_name ?? 'Shop', ...base] : base
    })

    const csv = [headerRow, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `merch-orders.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-dashed p-8 text-center space-y-1">
        <p className="text-sm font-medium text-gray-600">No merchandise orders yet</p>
        <p className="text-xs text-gray-400">Orders will appear here once players purchase items.</p>
      </div>
    )
  }

  const total = orders.reduce((sum, o) => sum + o.unit_price_cents * o.quantity, 0)
  const paidTotal = orders
    .filter((o) => o.status === 'paid' || o.status === 'fulfilled')
    .reduce((sum, o) => sum + o.unit_price_cents * o.quantity, 0)

  const colSpan = showSource ? 8 : 7

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-300">|</span>
          <span className="font-medium text-gray-700">${(paidTotal / 100).toFixed(2)} collected</span>
          {paidOrders.length > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-blue-600">{paidOrders.length} awaiting fulfillment</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {paidOrders.length > 0 && (
            <button
              type="button"
              onClick={handleFulfillAll}
              disabled={fulfillAllPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {fulfillAllPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Fulfilling…
                </>
              ) : (
                <>Fulfill All ({paidOrders.length})</>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 border hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50">
                {showSource && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Source</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Player</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Item</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Size</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                  {showSource && (
                    <td className="px-4 py-3">
                      <SourceBadge leagueName={order.league_name} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">
                        {order.player_name ?? 'Unknown'}
                      </p>
                      {order.player_email && (
                        <p className="text-xs text-gray-400 truncate max-w-[160px]">{order.player_email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-800 max-w-[180px] truncate">{order.item_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-600">{order.variant_label ?? <span className="text-gray-300">—</span>}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-gray-800">{order.quantity}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium text-gray-800">
                      ${((order.unit_price_cents * order.quantity) / 100).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.status === 'pending' && isManualPayment && (
                      markPaidOpenId === order.id ? (
                        <div className="flex flex-col gap-1.5 items-end min-w-[180px]">
                          <div className="flex gap-1.5">
                            <select
                              value={markPaidMethod}
                              onChange={e => setMarkPaidMethod(e.target.value as 'etransfer' | 'cash')}
                              className="border rounded px-1.5 py-1 text-xs"
                            >
                              <option value="etransfer">e-Transfer</option>
                              <option value="cash">Cash</option>
                            </select>
                          </div>
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={markPaidNotes}
                            onChange={e => setMarkPaidNotes(e.target.value)}
                            className="border rounded px-1.5 py-1 text-xs w-full"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(order.id)}
                              disabled={markPaidPendingId === order.id}
                              className="text-xs px-2.5 py-1 rounded-md font-semibold text-white disabled:opacity-60"
                              style={{ backgroundColor: 'var(--brand-primary)' }}
                            >
                              {markPaidPendingId === order.id ? 'Saving…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setMarkPaidOpenId(null); setMarkPaidNotes('') }}
                              className="text-xs px-2.5 py-1 rounded-md border text-gray-600 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMarkPaidOpenId(order.id)}
                          className="text-xs px-2.5 py-1 rounded-md border font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                        >
                          Mark as Paid
                        </button>
                      )
                    )}
                    {order.status === 'paid' && (
                      <button
                        type="button"
                        onClick={() => handleFulfill(order.id)}
                        disabled={fulfillPendingId === order.id}
                        className="text-xs font-medium text-[var(--brand-primary)] hover:opacity-75 transition-opacity disabled:opacity-40"
                      >
                        {fulfillPendingId === order.id ? 'Fulfilling…' : 'Fulfill'}
                      </button>
                    )}
                    {order.status === 'fulfilled' && order.fulfilled_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(order.fulfilled_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t">
                <td colSpan={showSource ? 5 : 4} className="px-4 py-3 text-xs font-semibold text-gray-500">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-800">
                  ${(total / 100).toFixed(2)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
