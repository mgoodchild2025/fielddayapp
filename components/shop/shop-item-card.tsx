'use client'

import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ShopItem } from '@/actions/merchandise'
import type { CartItem } from './cart-provider'

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
  const modalRef = useRef<HTMLDivElement>(null)
  // Portal target — only available after mount (client only).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // All images: primary + gallery
  const allImages = [item.image_url, ...(item.additional_images ?? [])].filter(Boolean) as string[]

  const hasVariants = item.variants.length > 0
  const needsVariantSelection = hasVariants && !selectedVariantId
  const selectedVariant = item.variants.find((v) => v.id === selectedVariantId) ?? null

  const maxQty = selectedVariant?.stock_quantity != null
    ? Math.max(0, Math.min(10, selectedVariant.stock_quantity))
    : 10

  useEffect(() => {
    setQuantity((q) => Math.min(q, Math.max(1, maxQty)))
  }, [maxQty])

  // Close modal on Escape
  useEffect(() => {
    if (!modalOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (modalOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [modalOpen])

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
      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
        justAdded
          ? 'bg-green-500 text-white scale-95'
          : 'text-white hover:opacity-90 active:scale-95'
      } ${inModal ? 'py-3 text-sm' : ''}`}
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
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
            </div>
          )}
        </button>

        {/* Content */}
        <div className="p-3 sm:p-4 flex flex-col gap-2.5">
          {/* Name + truncated description */}
          <div>
            <button
              type="button"
              onClick={() => openModal()}
              className="text-left focus:outline-none w-full"
            >
              <h3 className="font-semibold text-gray-900 text-sm leading-snug hover:underline line-clamp-2">{item.name}</h3>
              {item.description?.trim() && (
                // Collapse ALL whitespace (incl. newlines) to single spaces for the
                // 2-line preview. iOS Safari's -webkit-line-clamp doesn't cap the
                // height when the text contains newlines, so a description with
                // blank lines left a tall empty area. The modal shows the full,
                // line-break-preserved description.
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed break-words">
                  {item.description.replace(/\s+/g, ' ').trim()}
                </p>
              )}
            </button>
            <p className="text-base font-bold mt-1.5" style={{ color: 'var(--brand-primary)' }}>
              ${(item.price_cents / 100).toFixed(2)}
              <span className="text-xs font-normal text-gray-400 ml-1">{(item.currency ?? 'cad').toUpperCase()}</span>
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

          {/* Qty + add button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-7 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-base leading-none disabled:opacity-30"
                aria-label="Decrease quantity"
              >−</button>
              <span className="w-6 text-center text-xs font-semibold text-gray-800">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                className="w-7 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-base leading-none disabled:opacity-30"
                aria-label="Increase quantity"
              >+</button>
            </div>
            {addButton()}
          </div>
        </div>
      </div>

      {/* Modal — portaled to <body> so it escapes any card stacking context
          and reliably sits above the fixed bottom nav. */}
      {modalOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={item.name}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* Panel — bottom sheet on mobile, centered dialog on desktop.
              Uses dvh so the full panel (incl. the Add button) stays visible
              within the actual viewport on mobile browsers. */}
          <div
            ref={modalRef}
            className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-500 hover:text-gray-800 hover:bg-white shadow-sm transition-colors"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Image / carousel */}
            {allImages.length > 0 && (
              <div className="relative bg-gray-50 rounded-t-2xl overflow-hidden">
                {/* Main image */}
                <div className="relative w-full aspect-video sm:aspect-square">
                  <Image
                    key={allImages[selectedImageIdx]}
                    src={allImages[selectedImageIdx]}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 448px"
                    className="object-cover"
                    unoptimized
                  />

                  {/* Prev/Next arrows — only when multiple images */}
                  {allImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedImageIdx((i) => (i - 1 + allImages.length) % allImages.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                        aria-label="Previous image"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedImageIdx((i) => (i + 1) % allImages.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
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
                  <div className="flex items-center justify-center gap-1.5 py-2">
                    {allImages.map((src, idx) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setSelectedImageIdx(idx)}
                        className={`w-2 h-2 rounded-full transition-colors ${idx === selectedImageIdx ? 'bg-gray-700' : 'bg-gray-300 hover:bg-gray-500'}`}
                        aria-label={`View image ${idx + 1}`}
                      />
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
                <p className="text-lg font-bold shrink-0" style={{ color: 'var(--brand-primary)' }}>
                  ${(item.price_cents / 100).toFixed(2)}
                  <span className="text-xs font-normal text-gray-400 ml-1">{(item.currency ?? 'cad').toUpperCase()}</span>
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
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
