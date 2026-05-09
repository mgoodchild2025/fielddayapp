'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import { upsertMerchandiseItem, upsertMerchandiseVariants, uploadMerchandiseImage } from '@/actions/merchandise'
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
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null)
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    (item?.variants ?? []).map((v) => ({
      key: nextKey++,
      label: v.label,
      stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : '',
    }))
  )
  const [stockStr, setStockStr] = useState(
    item?.stock_quantity != null ? String(item.stock_quantity) : ''
  )
  const [shopEnabled, setShopEnabled] = useState(item?.shop_enabled ?? false)
  const [lowStockThreshold, setLowStockThreshold] = useState(
    item?.low_stock_threshold != null ? String(item.low_stock_threshold) : '5'
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Must have a saved item ID to upload
    if (!item?.id) {
      setError('Save the item first, then add an image.')
      return
    }

    setIsUploadingImage(true)
    setError(null)

    const fd = new FormData()
    fd.append('image', file)
    const result = await uploadMerchandiseImage(item.id, fd)
    setIsUploadingImage(false)

    if (result.error) {
      setError(result.error)
    } else if (result.url) {
      setImageUrl(result.url)
    }
    // reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
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
      // Item-level stock only applies when no variants — variants track their own stock
      const itemStock = variants.length === 0 && stockStr.trim()
        ? parseInt(stockStr, 10)
        : null

      const result = await upsertMerchandiseItem({
        id: item?.id,
        name: name.trim(),
        description: description.trim() || null,
        price_cents: priceCents,
        image_url: imageUrl,
        is_active: item?.is_active ?? true,
        shop_enabled: shopEnabled,
        stock_quantity: itemStock,
        low_stock_threshold: lowStockThreshold.trim() ? parseInt(lowStockThreshold, 10) : 5,
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
        {/* Image upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Item image <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-4">
            {/* Preview circle */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="relative w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden hover:border-gray-400 transition-colors group shrink-0 disabled:opacity-50"
              title={item?.id ? 'Click to upload image' : 'Save item first to add image'}
            >
              {imageUrl ? (
                <>
                  <Image
                    src={imageUrl}
                    alt={name || 'Item image'}
                    fill
                    sizes="80px"
                    className="object-cover rounded-xl"
                    unoptimized
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </>
              ) : isUploadingImage ? (
                <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              )}
            </button>

            <div className="text-xs text-gray-500 space-y-1">
              {item?.id ? (
                <>
                  <p>JPEG, PNG, GIF, or WebP · max 5 MB · auto-converted to WebP</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="font-medium text-[var(--brand-primary)] hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    {imageUrl ? 'Replace image' : 'Upload image'}
                  </button>
                </>
              ) : (
                <p className="italic text-gray-400">Save the item first to add an image</p>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

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

        {/* Stock quantity — only for variant-less items */}
        {variants.length === 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stock quantity <span className="text-gray-400 font-normal">(optional — leave blank for unlimited)</span>
            </label>
            <input
              type="number"
              min="0"
              value={stockStr}
              onChange={(e) => setStockStr(e.target.value)}
              placeholder="∞ unlimited"
              className="w-40 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
            />
          </div>
        )}

        {/* Low-stock threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Low-stock alert threshold <span className="text-gray-400 font-normal">(notify when stock ≤ this number)</span>
          </label>
          <input
            type="number"
            min="0"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            placeholder="5"
            className="w-40 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          />
        </div>

        {/* Shop toggle */}
        <div className="flex items-center justify-between py-3 border-t">
          <div>
            <p className="text-sm font-medium text-gray-900">Show in shop</p>
            <p className="text-xs text-gray-500">Players can purchase this item at any time from the shop</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={shopEnabled}
            onClick={() => setShopEnabled(!shopEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--brand-primary)] ${shopEnabled ? 'bg-[var(--brand-primary)]' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${shopEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
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
