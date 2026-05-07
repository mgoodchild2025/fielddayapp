'use client'

import { useState, useTransition } from 'react'
import { toggleLeagueMerchandise } from '@/actions/merchandise'
import type { MerchItem } from '@/actions/merchandise'

interface Props {
  leagueId: string
  allItems: MerchItem[]       // all active org items
  enabledItemIds: string[]    // item ids currently attached to this league
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function LeagueMerchToggle({ leagueId, allItems, enabledItemIds }: Props) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(enabledItemIds))
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleToggle(itemId: string, value: boolean) {
    setError(null)
    setPendingId(itemId)
    startTransition(async () => {
      const result = await toggleLeagueMerchandise(leagueId, itemId, value)
      setPendingId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setEnabled((prev) => {
          const next = new Set(prev)
          if (value) next.add(itemId)
          else next.delete(itemId)
          return next
        })
      }
    })
  }

  if (allItems.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-dashed p-8 text-center space-y-2">
        <p className="text-sm font-medium text-gray-600">No merchandise items in your library</p>
        <p className="text-xs text-gray-400">
          Go to <strong>Settings → Merchandise</strong> to create items first.
        </p>
      </div>
    )
  }

  const activeItems = allItems.filter((i) => i.is_active)
  const enabledItems = activeItems.filter((i) => enabled.has(i.id))
  const disabledItems = activeItems.filter((i) => !enabled.has(i.id))

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {enabledItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Enabled for this event</p>
          {enabledItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              checked
              pending={pendingId === item.id}
              onToggle={(v) => handleToggle(item.id, v)}
            />
          ))}
        </div>
      )}

      {disabledItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {enabledItems.length > 0 ? 'Available to add' : 'All items — none enabled yet'}
          </p>
          {disabledItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              checked={false}
              pending={pendingId === item.id}
              onToggle={(v) => handleToggle(item.id, v)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  checked,
  pending,
  onToggle,
}: {
  item: MerchItem
  checked: boolean
  pending: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div className={`bg-white rounded-lg border p-4 flex items-center gap-4 ${!checked ? 'opacity-70' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 truncate">{item.name}</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
            ${(item.price_cents / 100).toFixed(2)}
          </span>
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>
        )}
        {item.variants.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.variants.map((v) => (
              <span key={v.id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {v.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onToggle} disabled={pending} />
    </div>
  )
}
