'use client'

import { useState } from 'react'

export type MerchItemForStep = {
  id: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  variants: {
    id: string
    label: string
    stock_quantity: number | null
  }[]
}

export type MerchSelection = {
  itemId: string
  variantId: string | null
  quantity: number
}

interface Props {
  items: MerchItemForStep[]
  onContinue: (selections: MerchSelection[]) => void
  onSkip: () => void
  onBack?: () => void
}

type SelectionState = {
  variantId: string | null
  quantity: number
}

export function StepAddons({ items, onContinue, onSkip, onBack }: Props) {
  // Map: itemId -> { variantId, quantity }
  const [selections, setSelections] = useState<Map<string, SelectionState>>(() => new Map())

  function getSelection(itemId: string): SelectionState {
    return selections.get(itemId) ?? { variantId: null, quantity: 0 }
  }

  function setVariant(itemId: string, variantId: string | null) {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(itemId) ?? { variantId: null, quantity: 0 }
      // When changing variant, reset to 0 if different variant selected
      const newQty = variantId !== existing.variantId ? 0 : existing.quantity
      next.set(itemId, { variantId, quantity: newQty })
      return next
    })
  }

  function setQuantity(itemId: string, delta: number) {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(itemId) ?? { variantId: null, quantity: 0 }
      const newQty = Math.max(0, existing.quantity + delta)
      if (newQty === 0) {
        next.delete(itemId)
      } else {
        next.set(itemId, { ...existing, quantity: newQty })
      }
      return next
    })
  }

  // Check if an item with variants has a variant selected
  function canAddQuantity(item: MerchItemForStep): boolean {
    if (item.variants.length === 0) return true
    const sel = getSelection(item.id)
    return sel.variantId !== null
  }

  // Get available stock for current selection (null = unlimited)
  function getMaxQty(item: MerchItemForStep): number | null {
    if (item.variants.length === 0) return null
    const sel = getSelection(item.id)
    const variant = item.variants.find((v) => v.id === sel.variantId)
    return variant?.stock_quantity ?? null
  }

  function isVariantOutOfStock(item: MerchItemForStep, variantId: string): boolean {
    const variant = item.variants.find((v) => v.id === variantId)
    return variant?.stock_quantity === 0
  }

  const activeSelections: MerchSelection[] = Array.from(selections.entries())
    .filter(([, s]) => s.quantity > 0)
    .map(([itemId, s]) => ({
      itemId,
      variantId: s.variantId,
      quantity: s.quantity,
    }))

  const totalCents = activeSelections.reduce((sum, sel) => {
    const item = items.find((i) => i.id === sel.itemId)
    return sum + (item?.price_cents ?? 0) * sel.quantity
  }, 0)

  function handleContinue() {
    onContinue(activeSelections)
  }

  const currency = items[0]?.currency?.toUpperCase() ?? 'CAD'

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}

      <div className="bg-white rounded-lg border p-5 space-y-2">
        <h2 className="font-semibold text-lg">Merchandise</h2>
        <p className="text-sm text-gray-500">Add optional items to your registration. You can skip if you&apos;re not interested.</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const sel = getSelection(item.id)
          const maxQty = getMaxQty(item)
          const canAdd = canAddQuantity(item)
          const atMax = maxQty !== null && sel.quantity >= maxQty

          return (
            <div key={item.id} className="bg-white rounded-lg border p-4 space-y-3">
              {/* Item header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                  )}
                </div>
                <span className="font-bold text-lg shrink-0" style={{ color: 'var(--brand-primary)' }}>
                  ${(item.price_cents / 100).toFixed(0)}
                </span>
              </div>

              {/* Variant picker */}
              {item.variants.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Select size</p>
                  <div className="flex flex-wrap gap-2">
                    {item.variants.map((v) => {
                      const selected = sel.variantId === v.id
                      const outOfStock = isVariantOutOfStock(item, v.id)
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => setVariant(item.id, selected ? null : v.id)}
                          className={`
                            px-3 py-1.5 rounded-md text-sm font-medium border transition-all
                            ${outOfStock
                              ? 'opacity-40 cursor-not-allowed line-through text-gray-400 border-gray-200 bg-gray-50'
                              : selected
                                ? 'text-white border-transparent'
                                : 'text-gray-700 border-gray-200 bg-white hover:border-gray-400'
                            }
                          `}
                          style={selected ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' } : {}}
                        >
                          {v.label}
                          {v.stock_quantity !== null && v.stock_quantity > 0 && v.stock_quantity <= 5 && (
                            <span className="ml-1 text-xs opacity-70">({v.stock_quantity} left)</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Quantity stepper */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity(item.id, -1)}
                    disabled={sel.quantity === 0}
                    className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                    </svg>
                  </button>
                  <span className="w-8 text-center font-semibold text-gray-900 tabular-nums">
                    {sel.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(item.id, 1)}
                    disabled={!canAdd || atMax}
                    className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title={!canAdd ? 'Select a size first' : atMax ? 'Maximum stock reached' : undefined}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                {item.variants.length > 0 && !canAdd && (
                  <p className="text-xs text-amber-600">Select a size to add</p>
                )}

                {sel.quantity > 0 && (
                  <span className="ml-auto text-sm font-medium text-gray-700">
                    ${((item.price_cents * sel.quantity) / 100).toFixed(2)} {currency}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Total */}
      {totalCents > 0 && (
        <div className="bg-gray-50 rounded-lg border px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Merchandise total</span>
          <span className="font-bold text-lg" style={{ color: 'var(--brand-primary)' }}>
            ${(totalCents / 100).toFixed(2)} {currency}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 py-3 rounded-md font-semibold text-gray-600 border hover:bg-gray-50 transition-colors"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="flex-1 py-3 rounded-md font-semibold text-white transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {activeSelections.length > 0 ? `Add ${activeSelections.reduce((s, a) => s + a.quantity, 0)} item${activeSelections.reduce((s, a) => s + a.quantity, 0) !== 1 ? 's' : ''} →` : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
