'use client'

import Image from 'next/image'
import { useRef, useState, useEffect } from 'react'
import { Overlay } from '@/components/ui/overlay'
import type { ShopItem } from '@/actions/merchandise'
import type { CartItem } from './cart-provider'
import { canOptimizeImage } from '@/lib/image-src'

interface Props {
  item: ShopItem
  onAddToCart: (cartItem: CartItem) => void
  addedKey: string | null
}

export function ShopItemCard({ item, onAddToCart, addedKey }: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    item.variants.length === 1 ? item.variants[0].id : null
  )
  const [quantity, setQuantity] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedImageIdx, setSelectedImageIdx] = useState(0)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  // All images: primary + gallery
  const allImages = [item.image_url, ...(item.additional_images ?? [])].filter(Boolean) as string[]

  // Short, single-line description preview for the card. Truncating the TEXT
  // (not relying on CSS line-clamp) avoids the iOS Safari bug where
  // -webkit-line-clamp shows an ellipsis but doesn't cap the element height,
  // leaving tall blank space. The modal shows the full description.
  const descPreview = (() => {
    const d = item.description?.replace(/\s+/g, ' ').trim()
    if (!d) return null
    return d.length > 110 ? d.slice(0, 110).trimEnd() + '…' : d
  })()

  const hasVariants = item.variants.length > 0
  const needsVariantSelection = hasVariants && !selectedVariantId
  const selectedVariant = item.variants.find((v) => v.id === selectedVariantId) ?? null

  const maxQty = selectedVariant?.stock_quantity != null
    ? Math.max(0, Math.min(10, selectedVariant.stock_quantity))
    : 10

  useEffect(() => {
    setQuantity((q) => Math.min(q, Math.max(1, maxQty)))
  }, [maxQty])

  // Escape, scroll lock, focus and the portal come from the Overlay below.

  const cardKey = `${item.id}:${selectedVariantId ?? 'none'}`
  const justAdded = addedKey === cardKey
  const selectedSoldOut = selectedVariant !== null && selectedVariant.stock_quantity === 0

  function openModal() {
    setSelectedImageIdx(0)
    setModalOpen(true)
  }

  function handleAdd() {
    if (needsVariantSelection || selectedSoldOut || maxQty === 0) return
    onAddToCart({
      itemId: item.id,
      variantId: selectedVariantId,
      quantity: Math.min(quantity, maxQty),
      name: item.name,
      variantLabel: selectedVariant?.label ?? null,
      unitPriceCents: item.price_cents,
      currency: item.currency ?? 'cad',
      imageUrl: item.image_url,
    })
    setQuantity(1)
    setModalOpen(false)
  }

  const addButton = (inModal = false) => (
    <button
      type="button"
      onClick={handleAdd}
      disabled={needsVariantSelection || selectedSoldOut || maxQty === 0}
      className={`press flex-1 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
        justAdded
          ? 'bg-green-600 text-white'
          : 'text-white hover:opacity-90'
      } ${inModal ? 'min-h-12 text-base' : 'min-h-10 text-sm'}`}
      style={justAdded ? {} : { backgroundColor: 'var(--brand-primary)' }}
    >
      {justAdded
        ? '✓ Added'
        : selectedSoldOut || maxQty === 0
        ? 'Sold out'
        : needsVariantSelection
        ? 'Pick size'
        : 'Add to cart'}
    </button>
  )

  return (
    <>
      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
        {/* Image — clickable to open modal */}
        <button
          type="button"
          onClick={() => openModal()}
          className="relative block w-full aspect-square bg-gray-50 overflow-hidden focus:outline-none"
          aria-label={`View details for ${item.name}`}
        >
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover motion-safe:group-hover:scale-105 transition-transform duration-300"
              unoptimized={!canOptimizeImage(item.image_url)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
            </div>
          )}
        </button>

        {/* Content — flex-1 lets it fill an equal-height (desktop) card so the
            qty/add row can sit at the bottom (mt-auto). On mobile the card is
            content-height, so flex-1/mt-auto have no effect. */}
        <div className="p-3 sm:p-4 flex flex-col gap-2.5 flex-1">
          {/* Name + truncated description */}
          <div>
            <button
              type="button"
              onClick={() => openModal()}
              className="text-left focus:outline-none w-full"
            >
              <h3 className="font-semibold text-gray-900 text-sm leading-snug hover:underline">{item.name}</h3>
              {descPreview && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed break-words">{descPreview}</p>
              )}
            </button>
            <p className="text-base font-bold mt-1.5" style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}>
              ${(item.price_cents / 100).toFixed(2)}
              <span className="text-xs font-normal text-gray-500 ml-1">{(item.currency ?? 'cad').toUpperCase()}</span>
            </p>
          </div>

          {/* Variant picker */}
          {hasVariants && (
            <select
              value={selectedVariantId ?? ''}
              onChange={(e) => setSelectedVariantId(e.target.value || null)}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 bg-white appearance-none cursor-pointer"
            >
              <option value="">Select size</option>
              {item.variants.map((v) => (
                <option key={v.id} value={v.id} disabled={v.stock_quantity === 0}>
                  {v.label}
                  {v.stock_quantity === 0
                    ? ' — Sold out'
                    : v.stock_quantity !== null && v.stock_quantity <= 3
                    ? ` (${v.stock_quantity} left)`
                    : ''}
                </option>
              ))}
            </select>
          )}

          {/* Qty + add button — pinned to the bottom so buttons align across
              equal-height cards on desktop. */}
          <div className="flex items-center gap-2 mt-auto">
            {/* Phones: the 2-up grid left ~140px per card — a 28px stepper and
                a squeezed two-line button. The item sheet has a full stepper. */}
            <div className="hidden sm:flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-9 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors text-base leading-none disabled:opacity-30"
                aria-label="Decrease quantity"
              >−</button>
              <span className="w-6 text-center text-xs font-semibold text-gray-800">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                className="w-9 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors text-base leading-none disabled:opacity-30"
                aria-label="Increase quantity"
              >+</button>
            </div>
            {addButton()}
          </div>
        </div>
      </div>

      {/* Bottom sheet on mobile, centred dialog on desktop. Uses dvh so the
          full panel (incl. the Add button) stays visible within the actual
          viewport on mobile browsers. */}
      <Overlay
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        variant="sheet"
        label={item.name}
        zIndex={60}
        panelClassName="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto"
      >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-500 hover:text-gray-800 hover:bg-white shadow-sm transition-colors"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Image / carousel */}
            {allImages.length > 0 && (
              <div className="relative bg-gray-50 rounded-t-2xl overflow-hidden">
                {/* Main image — swipe left/right between photos (vertical
                    drags still belong to the sheet's drag-to-dismiss). */}
                <div
                  className="relative w-full aspect-video sm:aspect-square touch-pan-y"
                  data-no-drag={allImages.length > 1 ? '' : undefined}
                  onPointerDown={(e) => { swipeStart.current = { x: e.clientX, y: e.clientY } }}
                  onPointerUp={(e) => {
                    const st = swipeStart.current
                    swipeStart.current = null
                    if (!st || allImages.length < 2) return
                    const dx = e.clientX - st.x, dy = e.clientY - st.y
                    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
                    setSelectedImageIdx((i) => (dx < 0 ? (i + 1) % allImages.length : (i - 1 + allImages.length) % allImages.length))
                  }}
                  onPointerCancel={() => { swipeStart.current = null }}
                >
                  <Image
                    key={allImages[selectedImageIdx]}
                    src={allImages[selectedImageIdx]}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 448px"
                    className="object-cover"
                    unoptimized={!canOptimizeImage(allImages[selectedImageIdx])}
                  />

                  {/* Prev/Next arrows — only when multiple images */}
                  {allImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedImageIdx((i) => (i - 1 + allImages.length) % allImages.length)}
                        className="press absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/60"
                        aria-label="Previous image"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedImageIdx((i) => (i + 1) % allImages.length)}
                        className="press absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/60"
                        aria-label="Next image"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                {/* Thumbnail dots / strip — only when multiple images */}
                {allImages.length > 1 && (
                  <div className="flex items-center justify-center py-0.5">
                    {allImages.map((src, idx) => (
                      // 32px target around an 8px dot.
                      <button
                        key={src}
                        type="button"
                        onClick={() => setSelectedImageIdx(idx)}
                        className="group w-8 h-8 inline-flex items-center justify-center"
                        aria-label={`Image ${idx + 1} of ${allImages.length}`}
                        aria-current={idx === selectedImageIdx ? 'true' : undefined}
                      >
                        <span className={`w-2 h-2 rounded-full transition-colors ${idx === selectedImageIdx ? 'bg-gray-700' : 'bg-gray-300 group-hover:bg-gray-500'}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div className="p-5 sm:p-6 space-y-4">
              {/* Name + price */}
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-bold text-gray-900 text-lg leading-snug">{item.name}</h2>
                <p className="text-lg font-bold shrink-0" style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}>
                  ${(item.price_cents / 100).toFixed(2)}
                  <span className="text-xs font-normal text-gray-500 ml-1">{(item.currency ?? 'cad').toUpperCase()}</span>
                </p>
              </div>

              {/* Full description */}
              {item.description && (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{item.description}</p>
              )}

              {/* Variant picker */}
              {hasVariants && (
                <select
                  value={selectedVariantId ?? ''}
                  aria-label="Size"
                  onChange={(e) => setSelectedVariantId(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 bg-white appearance-none cursor-pointer"
                >
                  <option value="">Select size</option>
                  {item.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.stock_quantity === 0}>
                      {v.label}
                      {v.stock_quantity === 0
                        ? ' — Sold out'
                        : v.stock_quantity !== null && v.stock_quantity <= 3
                        ? ` (${v.stock_quantity} left)`
                        : ''}
                    </option>
                  ))}
                </select>
              )}

              {/* Qty + add */}
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="w-9 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-lg leading-none disabled:opacity-30"
                    aria-label="Decrease quantity"
                  >−</button>
                  <span className="w-8 text-center text-sm font-semibold text-gray-800">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                    disabled={quantity >= maxQty}
                    className="w-9 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-lg leading-none disabled:opacity-30"
                    aria-label="Increase quantity"
                  >+</button>
                </div>
                {addButton(true)}
              </div>
            </div>
      </Overlay>
    </>
  )
}
