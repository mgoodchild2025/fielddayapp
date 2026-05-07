'use client'

import { useState, useTransition } from 'react'
import { upsertMerchandiseItem, upsertMerchandiseVariants } from '@/actions/merchandise'
import type { MerchItem } from '@/actions/merchandise'

type VariantDraft = {
  key: number
  label: string
  stock_quantity: string // string input, converted to int or null
}

let nextKey = 1

interface Props {
  item?: MerchItem
  onSaved: (id: string) => void
  onCancel: () => void
}

export function MerchItemForm({ item, onSaved, onCancel }: Props) {
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [priceStr, setPriceStr] = useState(
    item ? (item.price_cents / 100).toFixed(2) : ''
  )
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    (item?.variants ?? []).map((v) => ({
      key: nextKey++,
      label: v.label,
      stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : '',
    }))
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function addVariant() {
    setVariants((prev) => [...prev, { key: nextKey++, label: '', stock_quantity: '' }])
  }

  function updateVariant(key: number, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)))
  }

  function removeVariant(key: number) {
    setVariants((prev) => prev.filter((v) => v.key !== key))
  }

  function moveVariant(key: number, dir: 'up' | 'down') {
    setVariants((prev) => {
      const idx = prev.findIndex((v) => v.key === key)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const priceCents = Math.round(parseFloat(priceStr) * 100)
    if (!name.trim()) { setError('Name is required'); return }
    if (isNaN(priceCents) || priceCents < 0) { setError('Enter a valid price'); return }

    for (const v of variants) {
      if (!v.label.trim()) { setError('All variant labels must be filled in'); return }
    }

    startTransition(async () => {
      const result = await upsertMerchandiseItem({
        id: item?.id,
        name: name.trim(),
        description: description.trim() || null,
        price_cents: priceCents,
        is_active: item?.is_active ?? true,
      })

      if (result.error) { setError(result.error); return }

      const variantData = variants.map((v) => ({
        label: v.label.trim(),
        stock_quantity: v.stock_quantity.trim() ? parseInt(v.stock_quantity, 10) : null,
      }))

      const varResult = await upsertMerchandiseVariants(result.id!, variantData)
      if (varResult.error) { setError(varResult.error); return }

      setSaved(true)
      setTimeout(() => {
        onSaved(result.id!)
      }, 600)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border divide-y">
      <div className="px-5 py-4">
        <h3 className="font-semibold text-gray-900">{item ? 'Edit Item' : 'New Item'}</h3>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Item name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Team Jersey"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Short description shown to players during registration"
            className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          />
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price (CAD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="0.00"
              className="w-full border rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
              required
            />
          </div>
        </div>

        {/* Variants */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Variants / Sizes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <button
              type="button"
              onClick={addVariant}
              className="text-xs font-medium text-[var(--brand-primary)] hover:opacity-80 transition-opacity"
            >
              + Add variant
            </button>
          </div>

          {variants.length === 0 && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-md px-3 py-2.5">
              No variants — item has no size/colour options. Add one if needed.
            </p>
          )}

          <div className="space-y-2">
            {variants.map((v, idx) => (
              <div key={v.key} className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveVariant(v.key, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-0 transition-colors"
                    aria-label="Move up"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVariant(v.key, 'down')}
                    disabled={idx === variants.length - 1}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-0 transition-colors"
                    aria-label="Move down"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                <input
                  type="text"
                  value={v.label}
                  onChange={(e) => updateVariant(v.key, { label: e.target.value })}
                  placeholder="e.g. Small"
                  className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
                />

                <div className="relative w-28 shrink-0">
                  <input
                    type="number"
                    min="0"
                    value={v.stock_quantity}
                    onChange={(e) => updateVariant(v.key, { stock_quantity: e.target.value })}
                    placeholder="∞ stock"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeVariant(v.key)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0"
                  aria-label="Remove variant"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {variants.length > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">Label · Stock qty (leave blank = unlimited)</p>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 border hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Saving…' : 'Save Item'}
          </button>
        </div>
      </div>
    </form>
  )
}
