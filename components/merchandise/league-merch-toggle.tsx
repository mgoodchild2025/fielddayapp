'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { toggleLeagueMerchandise, updateLeagueMerchandisePrice } from '@/actions/merchandise'
import type { MerchItem } from '@/actions/merchandise'

interface Props {
  leagueId: string
  allItems: MerchItem[]                          // all active org items
  enabledItemIds: string[]                       // item ids currently attached to this league
  enabledItemPrices: Record<string, number | null> // item_id → price_override_cents
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

export function LeagueMerchToggle({ leagueId, allItems, enabledItemIds, enabledItemPrices }: Props) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(enabledItemIds))
  // price overrides: item_id → override cents (null = use base price)
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number | null>>(enabledItemPrices)
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null)
  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleToggle(itemId: string, value: boolean) {
    setError(null)
    setPendingToggleId(itemId)
    startTransition(async () => {
      const result = await toggleLeagueMerchandise(leagueId, itemId, value)
      setPendingToggleId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setEnabled((prev) => {
          const next = new Set(prev)
          if (value) next.add(itemId)
          else next.delete(itemId)
          return next
        })
        // Clear price override when disabling
        if (!value) {
          setPriceOverrides((prev) => {
            const next = { ...prev }
            delete next[itemId]
            return next
          })
        }
      }
    })
  }

  function handlePriceSave(itemId: string, rawValue: string) {
    const trimmed = rawValue.trim()
    const overrideCents = trimmed === '' ? null : Math.round(parseFloat(trimmed) * 100)
    if (trimmed !== '' && (isNaN(overrideCents!) || overrideCents! < 0)) return // invalid input

    setError(null)
    setPendingPriceId(itemId)
    startTransition(async () => {
      const result = await updateLeagueMerchandisePrice(leagueId, itemId, overrideCents)
      setPendingPriceId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setPriceOverrides((prev) => ({ ...prev, [itemId]: overrideCents }))
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
              pending={pendingToggleId === item.id}
              priceSaving={pendingPriceId === item.id}
              priceOverrideCents={priceOverrides[item.id] ?? null}
              onToggle={(v) => handleToggle(item.id, v)}
              onPriceSave={(val) => handlePriceSave(item.id, val)}
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
              pending={pendingToggleId === item.id}
              priceSaving={false}
              priceOverrideCents={null}
              onToggle={(v) => handleToggle(item.id, v)}
              onPriceSave={() => {}}
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
  priceSaving,
  priceOverrideCents,
  onToggle,
  onPriceSave,
}: {
  item: MerchItem
  checked: boolean
  pending: boolean
  priceSaving: boolean
  priceOverrideCents: number | null
  onToggle: (v: boolean) => void
  onPriceSave: (val: string) => void
}) {
  const [priceInput, setPriceInput] = useState(
    priceOverrideCents !== null ? (priceOverrideCents / 100).toFixed(2) : ''
  )
  const [dirty, setDirty] = useState(false)

  const displayPrice = priceOverrideCents !== null
    ? (priceOverrideCents / 100).toFixed(2)
    : (item.price_cents / 100).toFixed(2)

  const isOverrideActive = priceOverrideCents !== null

  return (
    <div className={`bg-white rounded-lg border p-4 space-y-3 ${!checked ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-4">
        {/* Thumbnail */}
        {item.image_url ? (
          <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border bg-gray-50">
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-lg border bg-gray-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900 truncate">{item.name}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
              ${displayPrice}
              {isOverrideActive && (
                <span className="ml-1 text-xs text-gray-400 font-normal line-through">
                  ${(item.price_cents / 100).toFixed(2)}
                </span>
              )}
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
                  {v.stock_quantity !== null && (
                    <span className="ml-0.5 text-gray-400">({v.stock_quantity})</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <Toggle checked={checked} onChange={onToggle} disabled={pending} />
      </div>

      {/* Price override — only shown when item is enabled */}
      {checked && (
        <div className="flex items-center gap-3 pt-1 border-t">
          <label className="text-xs text-gray-500 shrink-0">Event price override</label>
          <div className="relative flex-1 max-w-[140px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => { setPriceInput(e.target.value); setDirty(true) }}
              placeholder={(item.price_cents / 100).toFixed(2)}
              className="w-full border rounded-md pl-6 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
            />
          </div>
          {dirty && (
            <button
              type="button"
              disabled={priceSaving}
              onClick={() => { onPriceSave(priceInput); setDirty(false) }}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--brand-primary)] text-[var(--brand-primary)] hover:bg-[var(--brand-primary)] hover:text-white transition-colors disabled:opacity-50"
            >
              {priceSaving ? 'Saving…' : 'Save'}
            </button>
          )}
          {!dirty && priceOverrideCents !== null && (
            <button
              type="button"
              disabled={priceSaving}
              onClick={() => { setPriceInput(''); onPriceSave(''); setDirty(false) }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear
            </button>
          )}
          {!dirty && priceOverrideCents === null && (
            <span className="text-xs text-gray-400">Using base price</span>
          )}
        </div>
      )}
    </div>
  )
}
