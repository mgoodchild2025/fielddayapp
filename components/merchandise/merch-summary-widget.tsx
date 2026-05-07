import type { MerchOrder } from '@/actions/merchandise'

interface Props {
  orders: MerchOrder[]
  leagueId: string
}

export function MerchSummaryWidget({ orders, leagueId }: Props) {
  if (orders.length === 0) return null

  const paidOrders = orders.filter((o) => o.status === 'paid' || o.status === 'fulfilled')
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const fulfilledOrders = orders.filter((o) => o.status === 'fulfilled')

  const totalRevenueCents = paidOrders.reduce(
    (sum, o) => sum + o.unit_price_cents * o.quantity,
    0
  )
  const totalItemsSold = paidOrders.reduce((sum, o) => sum + o.quantity, 0)
  const totalFulfilled = fulfilledOrders.reduce((sum, o) => sum + o.quantity, 0)
  const fulfillmentPct = totalItemsSold > 0 ? Math.round((totalFulfilled / totalItemsSold) * 100) : 0

  // Top items breakdown (paid + fulfilled, grouped by item)
  const itemTotals = new Map<string, { name: string; qty: number; revenueCents: number }>()
  for (const order of paidOrders) {
    const key = order.item_id
    const name = order.item_name ?? 'Unknown'
    const existing = itemTotals.get(key)
    if (existing) {
      existing.qty += order.quantity
      existing.revenueCents += order.unit_price_cents * order.quantity
    } else {
      itemTotals.set(key, {
        name,
        qty: order.quantity,
        revenueCents: order.unit_price_cents * order.quantity,
      })
    }
  }
  const topItems = [...itemTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 4)

  return (
    <div className="bg-white rounded-lg border p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-900">Merchandise</h2>
        <a
          href={`/admin/events/${leagueId}/merchandise`}
          className="text-xs font-medium hover:opacity-75 transition-opacity"
          style={{ color: 'var(--brand-primary)' }}
        >
          View orders →
        </a>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox
          label="Revenue"
          value={`$${(totalRevenueCents / 100).toFixed(0)}`}
        />
        <StatBox
          label="Items sold"
          value={String(totalItemsSold)}
        />
        <StatBox
          label="Pending"
          value={String(pendingOrders.length)}
          muted={pendingOrders.length === 0}
        />
      </div>

      {/* Fulfillment progress */}
      {totalItemsSold > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Fulfillment</span>
            <span className="text-xs font-semibold text-gray-700">
              {totalFulfilled}/{totalItemsSold} items ({fulfillmentPct}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${fulfillmentPct}%`,
                backgroundColor: fulfillmentPct === 100 ? '#16a34a' : 'var(--brand-primary)',
              }}
            />
          </div>
        </div>
      )}

      {/* Top items */}
      {topItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Top items</p>
          {topItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 truncate flex-1 mr-2">{item.name}</span>
              <span className="text-gray-400 tabular-nums shrink-0">
                {item.qty} · ${(item.revenueCents / 100).toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
