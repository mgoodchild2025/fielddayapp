'use client'

import { useState, useTransition } from 'react'
import { fulfillMerchandiseOrder, fulfillAllMerchandiseOrders, fulfillAllShopOrders, fulfillAllOrgOrders, markMerchandiseOrderPaid } from '@/actions/merchandise'
import type { MerchOrder } from '@/actions/merchandise'
import { Overlay, useRetained } from '@/components/ui/overlay'
import { confirmAction } from '@/components/ui/confirm-dialog'

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
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
}

function StatusBadge({ order }: { order: MerchOrder }) {
  const isCompleted = order.status === 'fulfilled' && !!order.paid_at
  const label = isCompleted ? 'Completed' : order.status.charAt(0).toUpperCase() + order.status.slice(1)
  const colorClass = isCompleted ? STATUS_COLORS.completed : (STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return 'Manual'
  if (method === 'etransfer') return 'e-Transfer'
  if (method === 'cash') return 'Cash'
  if (method === 'stripe') return 'Stripe'
  return method.charAt(0).toUpperCase() + method.slice(1)
}

function SourceBadge({ order }: { order: MerchOrder }) {
  if (order.league_name) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-500 bg-gray-100 max-w-[140px] truncate" title={order.league_name}>
        {order.league_name}
      </span>
    )
  }
  if (order.sale_source === 'in_person') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
        In-person
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      Shop
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
  const [markPaidAmount, setMarkPaidAmount] = useState('')
  const [markPaidPendingId, setMarkPaidPendingId] = useState<string | null>(null)
  // Keep the sheet's order while it plays its exit.
  const markPaidOrder = useRetained(orders.find((o) => o.id === markPaidOpenId) ?? null)
  const [, startTransition] = useTransition()

  const fulfillableOrders = orders.filter((o) => o.status === 'pending' || o.status === 'paid')

  /** Standard price in cents for an order (before any admin override) */
  function standardCents(o: MerchOrder) {
    return o.unit_price_cents * o.quantity - (o.discount_cents ?? 0)
  }

  function openMarkPaid(o: MerchOrder) {
    setMarkPaidOpenId(o.id)
    setMarkPaidAmount((standardCents(o) / 100).toFixed(2))
    setMarkPaidNotes('')
    setMarkPaidMethod('etransfer')
  }

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

  async function handleFulfillAll() {
    // Bulk and one-way — every pending order is marked fulfilled.
    if (!(await confirmAction({
      title: `Mark ${fulfillableOrders.length} order${fulfillableOrders.length === 1 ? '' : 's'} as fulfilled?`,
      message: 'Use this once everything has been handed out.',
      confirmLabel: 'Fulfill all',
    }))) return
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
          prev.map((o) => (o.status === 'pending' || o.status === 'paid') ? { ...o, status: 'fulfilled', fulfilled_at: new Date().toISOString() } : o)
        )
      }
    })
  }

  function handleMarkPaid(orderId: string, standardCents: number) {
    setError(null)
    setMarkPaidPendingId(orderId)
    const parsedAmount = parseFloat(markPaidAmount)
    const amountCents = !isNaN(parsedAmount) && parsedAmount >= 0
      ? Math.round(parsedAmount * 100)
      : standardCents
    startTransition(async () => {
      const result = await markMerchandiseOrderPaid(orderId, {
        method: markPaidMethod,
        notes: markPaidNotes || undefined,
        amountCents,
      })
      setMarkPaidPendingId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setOrders((prev) =>
          prev.map((o) => o.id === orderId
            // fulfilled orders stay fulfilled; pending orders advance to paid
            ? {
                ...o,
                status: o.status === 'fulfilled' ? 'fulfilled' : 'paid',
                paid_at: new Date().toISOString(),
                payment_method: markPaidMethod,
                paid_by_name: result.collectedByName ?? o.paid_by_name ?? null,
                // Store override only when it differs from standard price
                amount_paid_cents: amountCents !== standardCents ? amountCents : null,
              }
            : o)
        )
        setMarkPaidOpenId(null)
        setMarkPaidNotes('')
        setMarkPaidAmount('')
        setMarkPaidMethod('etransfer')
      }
    })
  }

  function handleExportCsv() {
    const exportable = orders.filter((o) => o.status !== 'cancelled')
    if (exportable.length === 0) return

    const headerRow = showSource
      ? ['Source', 'Player Name', 'Email', 'Item', 'Size / Variant', 'Qty', 'Unit Price', 'Total', 'Discount Code', 'Status', 'Notes']
      : ['Player Name', 'Email', 'Item', 'Size / Variant', 'Qty', 'Unit Price', 'Total', 'Discount Code', 'Status', 'Notes']

    const rows = exportable.map((o) => {
      const base = [
        o.player_name ?? '',
        o.player_email ?? '',
        o.item_name ?? '',
        o.variant_label ?? '',
        String(o.quantity),
        `$${(o.unit_price_cents / 100).toFixed(2)}`,
        `$${((o.unit_price_cents * o.quantity - (o.discount_cents ?? 0)) / 100).toFixed(2)}`,
        o.discount_code_label ?? '',
        o.status,
        o.notes ?? '',
      ]
      const source = o.league_name ?? (o.sale_source === 'in_person' ? 'In-person' : 'Shop')
      return showSource ? [source, ...base] : base
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

  const total = orders.reduce((sum, o) => sum + o.unit_price_cents * o.quantity - (o.discount_cents ?? 0), 0)
  const paidTotal = orders
    .filter((o) => o.status === 'paid' || (o.status === 'fulfilled' && !!o.paid_at))
    .reduce((sum, o) => sum + o.unit_price_cents * o.quantity - (o.discount_cents ?? 0), 0)

  const colSpan = showSource ? 9 : 8

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
          {fulfillableOrders.length > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-blue-600">{fulfillableOrders.length} awaiting fulfillment</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {fulfillableOrders.length > 0 && (
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
                <>Fulfill All ({fulfillableOrders.length})</>
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
        {/* Phones: rows fold into cards — the 9-column table hid the Action column off-screen. */}
        <div className="sm:overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 max-sm:block">
            <thead className="max-sm:hidden">
              <tr className="bg-gray-50">
                {showSource && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Source</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Player</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Item</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Size</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Discount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 max-sm:block">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-2 max-sm:p-4">
                  {showSource && (
                    <td className="px-4 py-3 max-sm:p-0">
                      <SourceBadge order={order} />
                    </td>
                  )}
                  <td className="px-4 py-3 max-sm:p-0 max-sm:w-full">
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[160px] max-sm:max-w-none">
                        {order.player_name ?? 'Unknown'}
                      </p>
                      {order.player_email && (
                        <p className="text-xs text-gray-400 truncate max-w-[160px] max-sm:max-w-none">{order.player_email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-sm:p-0 max-sm:w-full">
                    <p className="text-sm text-gray-800 max-w-[180px] max-sm:max-w-none truncate">{order.item_name}</p>
                    {order.notes && (
                      <p className="text-xs text-gray-400 italic max-w-[180px] max-sm:max-w-none truncate" title={order.notes}>
                        📝 {order.notes}
                      </p>
                    )}
                  </td>
                  <td data-label="Size" className="px-4 py-3 max-sm:p-0 max-sm:flex max-sm:items-center max-sm:gap-1.5 max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:text-gray-500">
                    <p className="text-sm text-gray-600">{order.variant_label ?? <span className="text-gray-300">—</span>}</p>
                  </td>
                  <td data-label="Qty" className="px-4 py-3 text-center max-sm:p-0 max-sm:flex max-sm:items-center max-sm:gap-1.5 max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:text-gray-500">
                    <span className="text-sm text-gray-800">{order.quantity}</span>
                  </td>
                  <td data-label="Price" className="px-4 py-3 text-right max-sm:p-0 max-sm:flex max-sm:items-center max-sm:gap-1.5 max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:text-gray-500">
                    {order.amount_paid_cents !== null && order.amount_paid_cents !== undefined ? (
                      // Admin collected a custom amount — show override with strikethrough standard
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-gray-400 line-through">
                          ${(standardCents(order) / 100).toFixed(2)}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          ${(order.amount_paid_cents / 100).toFixed(2)}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Adjusted
                        </span>
                      </div>
                    ) : (order.discount_cents ?? 0) > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-gray-400 line-through">
                          ${((order.unit_price_cents * order.quantity) / 100).toFixed(2)}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          ${((order.unit_price_cents * order.quantity - order.discount_cents) / 100).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-gray-800">
                        ${((order.unit_price_cents * order.quantity) / 100).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td data-label="Code" className="px-4 py-3 max-sm:p-0 max-sm:flex max-sm:items-center max-sm:gap-1.5 max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:text-gray-500">
                    {order.discount_code_label ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-violet-50 text-violet-700 border border-violet-200">
                        {order.discount_code_label}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0">
                    <StatusBadge order={order} />
                  </td>
                  <td className="px-4 py-3 text-right max-sm:p-0 max-sm:w-full max-sm:text-left">
                    {((order.status === 'pending' && isManualPayment) || (order.status === 'fulfilled' && !order.paid_at)) && (
                        <button
                          type="button"
                          onClick={() => openMarkPaid(order)}
                          className="press min-h-10 px-3 rounded-md border text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                        >
                          Mark as Paid
                        </button>
                    )}
                    {(order.status === 'pending' || order.status === 'paid') && (
                      <button
                        type="button"
                        onClick={() => handleFulfill(order.id)}
                        disabled={fulfillPendingId === order.id}
                        className="press min-h-10 px-3 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-75 disabled:opacity-40"
                      >
                        {fulfillPendingId === order.id ? 'Fulfilling…' : 'Fulfill'}
                      </button>
                    )}
                    {order.status === 'fulfilled' && order.fulfilled_at && order.paid_at && (
                      <div className="flex flex-col items-end gap-1 min-w-[160px]">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Fulfilled {formatShortDate(order.fulfilled_at)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                          </svg>
                          <span>Paid {formatShortDate(order.paid_at)}</span>
                        </div>
                        {order.payment_method && (
                          <span className="text-xs text-gray-400">{formatPaymentMethod(order.payment_method)}</span>
                        )}
                        {order.paid_by_name && (
                          <span className="text-xs text-gray-400">by {order.paid_by_name}</span>
                        )}
                      </div>
                    )}
                    {order.status === 'fulfilled' && order.fulfilled_at && !order.paid_at && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-gray-400">
                          Fulfilled {formatShortDate(order.fulfilled_at)}
                        </span>
                        <span className="text-xs font-medium text-amber-600">Payment outstanding</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="max-sm:block">
              <tr className="bg-gray-50 border-t max-sm:flex max-sm:justify-between max-sm:items-center max-sm:px-4">
                <td colSpan={showSource ? 5 : 4} className="px-4 py-3 text-xs font-semibold text-gray-500 max-sm:px-0">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-800 max-sm:px-0">
                  ${(total / 100).toFixed(2)}
                </td>
                <td colSpan={2} className="max-sm:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Mark as paid — a sheet (it opened inside the Action cell, at 24px
          controls, on a table you had to scroll sideways to reach). */}
      <Overlay
        open={!!markPaidOpenId}
        onClose={() => { setMarkPaidOpenId(null); setMarkPaidNotes(''); setMarkPaidAmount('') }}
        variant="sheet"
        labelledBy="mark-paid-title"
        panelClassName="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5"
      >
        {markPaidOrder && (
          <div className="space-y-3">
            <div>
              <h2 id="mark-paid-title" className="text-lg font-semibold text-gray-900">Mark as paid</h2>
              <p className="text-sm text-gray-500 truncate">
                {markPaidOrder.player_name ?? 'Unknown'} · {markPaidOrder.item_name}{markPaidOrder.variant_label ? ` (${markPaidOrder.variant_label})` : ''} × {markPaidOrder.quantity}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-gray-600">Method
                <select
                  data-autofocus
                  value={markPaidMethod}
                  onChange={e => setMarkPaidMethod(e.target.value as 'etransfer' | 'cash')}
                  className="mt-1 w-full min-h-11 border rounded-md px-3 text-base sm:text-sm bg-white"
                >
                  <option value="etransfer">e-Transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600">Amount collected
                <span className="relative mt-1 block">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={markPaidAmount}
                    onChange={e => setMarkPaidAmount(e.target.value)}
                    className="w-full min-h-11 border rounded-md pl-6 pr-2 text-base sm:text-sm"
                  />
                </span>
              </label>
            </div>
            <label className="block text-xs font-medium text-gray-600">Notes
              <input
                type="text"
                placeholder="Optional"
                value={markPaidNotes}
                onChange={e => setMarkPaidNotes(e.target.value)}
                className="mt-1 w-full min-h-11 border rounded-md px-3 text-base sm:text-sm"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleMarkPaid(markPaidOrder.id, standardCents(markPaidOrder))}
                disabled={markPaidPendingId === markPaidOrder.id}
                className="press flex-1 min-h-11 rounded-lg text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-60"
              >
                {markPaidPendingId === markPaidOrder.id ? 'Saving…' : 'Mark as paid'}
              </button>
              <button
                type="button"
                onClick={() => { setMarkPaidOpenId(null); setMarkPaidNotes(''); setMarkPaidAmount('') }}
                className="press min-h-11 px-4 rounded-lg border text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Overlay>
    </div>
  )
}
