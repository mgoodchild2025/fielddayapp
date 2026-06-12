'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2 } from 'lucide-react'
import { recordInPersonSale } from '@/actions/merchandise'
import type { MerchItem } from '@/actions/merchandise'

interface Props {
  items: MerchItem[]
}

type Line = {
  itemId: string
  itemName: string
  variantId: string | null
  variantLabel: string | null
  quantity: number
  unitPriceCents: number
}

type PaymentMethod = 'cash' | 'etransfer' | 'card' | 'other'

/** Available stock for an item/variant; null = unlimited (untracked). */
function availableStock(item: MerchItem, variantId: string | null): number | null {
  if (variantId) {
    return item.variants.find((v) => v.id === variantId)?.stock_quantity ?? null
  }
  return item.stock_quantity
}

export function RecordSaleModal({ items }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const sellable = useMemo(() => items.filter((i) => i.is_active), [items])

  // Sale-level fields
  const [lines, setLines] = useState<Line[]>([])
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [fulfillNow, setFulfillNow] = useState(true)
  const [notes, setNotes] = useState('')

  // Add-line draft
  const [draftItemId, setDraftItemId] = useState('')
  const [draftVariantId, setDraftVariantId] = useState('')
  const [draftQty, setDraftQty] = useState(1)
  const [draftPrice, setDraftPrice] = useState('')

  const draftItem = sellable.find((i) => i.id === draftItemId) ?? null
  const draftNeedsVariant = !!draftItem && draftItem.variants.length > 0
  const draftAvailable = draftItem ? availableStock(draftItem, draftNeedsVariant ? draftVariantId || null : null) : null

  function resetDraft() {
    setDraftItemId('')
    setDraftVariantId('')
    setDraftQty(1)
    setDraftPrice('')
  }

  function selectDraftItem(id: string) {
    setDraftItemId(id)
    setDraftVariantId('')
    const item = sellable.find((i) => i.id === id)
    setDraftPrice(item ? (item.price_cents / 100).toFixed(2) : '')
  }

  function addLine() {
    if (!draftItem) return
    if (draftNeedsVariant && !draftVariantId) {
      setError('Choose a size / variant for this item.')
      return
    }
    const priceCents = Math.round(parseFloat(draftPrice || '0') * 100)
    if (isNaN(priceCents) || priceCents < 0) {
      setError('Enter a valid price.')
      return
    }
    const qty = Math.max(1, Math.floor(draftQty))
    const variant = draftNeedsVariant ? draftItem.variants.find((v) => v.id === draftVariantId) ?? null : null
    setLines((prev) => [
      ...prev,
      {
        itemId: draftItem.id,
        itemName: draftItem.name,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        quantity: qty,
        unitPriceCents: priceCents,
      },
    ])
    setError(null)
    resetDraft()
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0)

  function close() {
    setOpen(false)
    setLines([])
    setBuyerName('')
    setBuyerEmail('')
    setMethod('cash')
    setFulfillNow(true)
    setNotes('')
    resetDraft()
    setError(null)
  }

  function submit() {
    if (lines.length === 0) {
      setError('Add at least one item.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await recordInPersonSale({
        lines: lines.map((l) => ({
          itemId: l.itemId,
          variantId: l.variantId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
        })),
        buyerName: buyerName || undefined,
        buyerEmail: buyerEmail || undefined,
        paymentMethod: method,
        fulfillNow,
        notes: notes || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      close()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <Plus className="w-4 h-4" />
        Record a sale
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold text-gray-900">Record a sale</h2>
          <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
          )}

          {/* Line items */}
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 rounded-md border bg-gray-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{l.itemName}{l.variantLabel ? ` · ${l.variantLabel}` : ''}</p>
                  <p className="text-xs text-gray-500">{l.quantity} × ${(l.unitPriceCents / 100).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-gray-800">${((l.unitPriceCents * l.quantity) / 100).toFixed(2)}</span>
                  <button type="button" onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-600" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add-line row */}
          <div className="rounded-md border border-dashed p-3 space-y-2">
            <select
              value={draftItemId}
              onChange={(e) => selectDraftItem(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select an item…</option>
              {sellable.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>

            {draftNeedsVariant && (
              <select
                value={draftVariantId}
                onChange={(e) => setDraftVariantId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select size / variant…</option>
                {draftItem!.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}{v.stock_quantity !== null ? ` (${v.stock_quantity} in stock)` : ''}
                  </option>
                ))}
              </select>
            )}

            {draftItem && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-10">Qty</label>
                <input
                  type="number" min={1} value={draftQty}
                  onChange={(e) => setDraftQty(parseInt(e.target.value) || 1)}
                  className="border rounded px-2 py-1.5 text-sm w-20"
                />
                <label className="text-xs text-gray-500">Price</label>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <input
                    type="number" step="0.01" min="0" value={draftPrice}
                    onChange={(e) => setDraftPrice(e.target.value)}
                    className="border rounded pl-5 pr-2 py-1.5 text-sm w-full"
                  />
                </div>
              </div>
            )}

            {draftItem && draftAvailable !== null && draftQty > draftAvailable && (
              <p className="text-xs text-amber-600">Only {draftAvailable} in stock — recording this will take stock to 0.</p>
            )}

            <button
              type="button"
              onClick={addLine}
              disabled={!draftItem}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-primary)] disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Add item
            </button>
          </div>

          {/* Buyer (optional) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Buyer name (optional)</label>
              <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Walk-in" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email (optional)</label>
              <input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="—" />
            </div>
          </div>

          {/* Payment + fulfillment */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="cash">Cash</option>
                <option value="etransfer">e-Transfer</option>
                <option value="card">Card (in person)</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={fulfillNow} onChange={(e) => setFulfillNow(e.target.checked)} className="rounded" />
                Hand over now
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. sold at the spring tournament table" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3.5">
          <span className="text-sm font-semibold text-gray-900">Total: ${(total / 100).toFixed(2)}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || lines.length === 0}
              className="px-3.5 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {pending ? 'Recording…' : 'Record sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
