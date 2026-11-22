'use client'

import { formatDollars } from '@/lib/money'

import { useState } from 'react'
import Image from 'next/image'
import { canOptimizeImage } from '@/lib/image-src'
import { optionAxes, findVariant, isValueSoldOut, optionKey } from '@/lib/merch-options'

export type MerchItemForStep = {
  id: string
  name: string
  description: string | null
  price_cents: number           // base price (kept for reference)
  effective_price_cents: number // actual charge — override if set, else base
  currency: string
  image_url: string | null
  /** Colour → one of the item's photos, shown when that colour is picked. */
  colour_images?: Record<string, string> | null
  variants: {
    id: string
    label: string
    /** Colour × size items (lib/merch-options.ts); both null = a plain option. */
    colour?: string | null
    size?: string | null
    available_stock: number | null  // null = unlimited; already computed server-side
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
  /** Colour × size items: the picks so far (the variant needs both). */
  colour?: string | null
  size?: string | null
}

/** The shared option rules read `stock_quantity`; here that's what's still available. */
const asStock = (item: MerchItemForStep) =>
  item.variants.map((v) => ({ ...v, colour: v.colour ?? null, size: v.size ?? null, stock_quantity: v.available_stock }))

export function StepAddons({ items, onContinue, onSkip, onBack }: Props) {
  // Map: itemId -> { variantId, quantity }
  const [selections, setSelections] = useState<Map<string, SelectionState>>(() => new Map())

  // Nothing chosen yet: an item whose colour/size choices are all single
  // values has nothing to pick, so its one option counts as chosen.
  function defaultSelection(itemId: string): SelectionState {
    const item = items.find((i) => i.id === itemId)
    if (item && item.variants.length > 0) {
      const axes = optionAxes(asStock(item))
      if (axes.mode === 'grid' && axes.colours.length <= 1 && axes.sizes.length <= 1) {
        const v = findVariant(asStock(item), axes.colours[0] ?? null, axes.sizes[0] ?? null)
        if (v) return { variantId: v.id, quantity: 0, colour: axes.colours[0] ?? null, size: axes.sizes[0] ?? null }
      }
    }
    return { variantId: null, quantity: 0 }
  }

  function getSelection(itemId: string): SelectionState {
    return selections.get(itemId) ?? defaultSelection(itemId)
  }

  function setVariant(itemId: string, variantId: string | null) {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(itemId) ?? { variantId: null, quantity: 0 }
      // When changing variant, reset qty to 0 to avoid exceeding new variant's stock
      const newQty = variantId !== existing.variantId ? 0 : existing.quantity
      next.set(itemId, { variantId, quantity: newQty })
      return next
    })
  }

  // Colour × size: record the pick, then the variant once both are chosen (an
  // axis with one value counts as chosen).
  function pickOption(item: MerchItemForStep, axis: 'colour' | 'size', value: string) {
    const axes = optionAxes(asStock(item))
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(item.id) ?? { variantId: null, quantity: 0 }
      const colour = axis === 'colour' ? value : existing.colour ?? (axes.colours.length === 1 ? axes.colours[0] : null)
      const size = axis === 'size' ? value : existing.size ?? (axes.sizes.length === 1 ? axes.sizes[0] : null)
      const complete = (axes.colours.length === 0 || colour) && (axes.sizes.length === 0 || size)
      const variantId = complete ? findVariant(asStock(item), colour, size)?.id ?? null : null
      const quantity = variantId !== existing.variantId ? 0 : existing.quantity
      next.set(item.id, { variantId, quantity, colour, size })
      return next
    })
  }

  function setQuantity(itemId: string, delta: number) {
    setSelections((prev) => {
      const next = new Map(prev)
      const existing = next.get(itemId) ?? defaultSelection(itemId)
      // Back to 0 keeps the colour/size picked (only quantity > 0 is ordered).
      next.set(itemId, { ...existing, quantity: Math.max(0, existing.quantity + delta) })
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
    return variant?.available_stock ?? null
  }

  function isVariantOutOfStock(item: MerchItemForStep, variantId: string): boolean {
    const variant = item.variants.find((v) => v.id === variantId)
    return variant?.available_stock === 0
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
    return sum + (item?.effective_price_cents ?? 0) * sel.quantity
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
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                {(() => {
                  // The picked colour's photo, when the organiser matched one.
                  const src = (sel.colour && Object.entries(item.colour_images ?? {})
                    .find(([k]) => optionKey(k) === optionKey(sel.colour))?.[1]) || item.image_url
                  return src ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border bg-gray-50">
                      <Image
                        key={src}
                        src={src}
                        alt={item.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized={!canOptimizeImage(src)}
                      />
                    </div>
                  ) : null
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-wrap">{item.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-lg" style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}>
                        {formatDollars(item.effective_price_cents)}
                      </span>
                      {item.price_cents !== item.effective_price_cents && (
                        <p className="text-xs text-gray-400 line-through">
                          {formatDollars(item.price_cents)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Colour × size picker */}
              {item.variants.length > 0 && optionAxes(asStock(item)).mode === 'grid' && (() => {
                const stock = asStock(item)
                const axes = optionAxes(stock)
                const colour = sel.colour ?? (axes.colours.length === 1 ? axes.colours[0] : null)
                const size = sel.size ?? (axes.sizes.length === 1 ? axes.sizes[0] : null)
                const chip = (on: boolean, out: boolean) => `press min-h-10 px-3.5 rounded-md text-sm font-medium border ${
                  out ? 'opacity-40 cursor-not-allowed line-through text-gray-400 border-gray-200 bg-gray-50'
                  : on ? 'bg-brand-primary text-on-brand border-brand-primary'
                  : 'text-gray-700 border-gray-200 bg-white hover:border-gray-400'}`
                const picked = item.variants.find((v) => v.id === sel.variantId)
                return (
                  <div className="space-y-3">
                    {axes.colours.length > 0 && (
                      <div role="group" aria-label={`${item.name} colour`}>
                        <p className="text-xs font-medium text-gray-500 mb-2">Colour{colour ? `: ${colour}` : ''}</p>
                        <div className="flex flex-wrap gap-2">
                          {axes.colours.map((c) => {
                            const out = isValueSoldOut(stock, 'colour', c)
                            const on = optionKey(colour) === optionKey(c)
                            return (
                              <button key={c} type="button" disabled={out} aria-pressed={on}
                                aria-label={out ? `${c}, sold out` : c}
                                onClick={() => pickOption(item, 'colour', c)} className={chip(on, out)}>
                                {c}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {axes.sizes.length > 0 && (
                      <div role="group" aria-label={`${item.name} size`}>
                        <p className="text-xs font-medium text-gray-500 mb-2">Size{size ? `: ${size}` : ''}</p>
                        <div className="flex flex-wrap gap-2">
                          {axes.sizes.map((z) => {
                            const out = isValueSoldOut(stock, 'size', z, colour)
                            const on = optionKey(size) === optionKey(z)
                            return (
                              <button key={z} type="button" disabled={out} aria-pressed={on}
                                aria-label={out ? `${z}, sold out` : z}
                                onClick={() => pickOption(item, 'size', z)} className={chip(on, out)}>
                                {z}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {picked && picked.available_stock !== null && picked.available_stock > 0 && picked.available_stock <= 5 && (
                      <p className="text-xs font-medium text-amber-700">Only {picked.available_stock} left in {picked.label}</p>
                    )}
                  </div>
                )
              })()}

              {/* Single list of options */}
              {item.variants.length > 0 && optionAxes(asStock(item)).mode === 'list' && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Select size</p>
                  <div className="flex flex-wrap gap-2">
                    {item.variants.map((v) => {
                      const selected = sel.variantId === v.id
                      const outOfStock = isVariantOutOfStock(item, v.id)
                      const lowStock = v.available_stock !== null && v.available_stock > 0 && v.available_stock <= 5
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => setVariant(item.id, selected ? null : v.id)}
                          aria-pressed={selected}
                          className={`
                            press min-h-10 px-3.5 rounded-md text-sm font-medium border
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
                          {outOfStock && <span className="ml-1 text-xs">(sold out)</span>}
                          {lowStock && !outOfStock && (
                            <span className="ml-1 text-xs opacity-70">({v.available_stock} left)</span>
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
                    aria-label={`One fewer ${item.name}`}
                    className="press w-10 h-10 rounded-full border flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    aria-label={`One more ${item.name}`}
                    className="press w-10 h-10 rounded-full border flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                {item.variants.length > 0 && !canAdd && (
                  <p className="text-xs text-amber-700">
                    {(() => {
                      const axes = optionAxes(asStock(item))
                      if (axes.mode === 'list') return 'Select a size to add'
                      const needColour = axes.colours.length > 1 && !sel.colour
                      const needSize = axes.sizes.length > 1 && !sel.size
                      return needColour && needSize ? 'Pick a colour and size to add' : needColour ? 'Pick a colour to add' : 'Pick a size to add'
                    })()}
                  </p>
                )}
                {atMax && canAdd && (
                  <p className="text-xs text-gray-500">No more in stock</p>
                )}

                {sel.quantity > 0 && (
                  <span className="ml-auto text-sm font-medium text-gray-700">
                    ${((item.effective_price_cents * sel.quantity) / 100).toFixed(2)} {currency}
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
          <span className="font-bold text-lg" style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}>
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
          {activeSelections.length > 0
            ? `Add ${activeSelections.reduce((s, a) => s + a.quantity, 0)} item${activeSelections.reduce((s, a) => s + a.quantity, 0) !== 1 ? 's' : ''} →`
            : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
