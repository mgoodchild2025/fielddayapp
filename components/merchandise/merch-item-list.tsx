'use client'

import { useState, useTransition } from 'react'
import { MerchItemForm } from './merch-item-form'
import { deleteMerchandiseItem } from '@/actions/merchandise'
import type { MerchItem } from '@/actions/merchandise'
import { useRouter } from 'next/navigation'

interface Props {
  items: MerchItem[]
}

export function MerchItemList({ items: initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<MerchItem[]>(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleSaved(id: string) {
    setEditingId(null)
    setShowNew(false)
    router.refresh()
  }

  function handleArchive(itemId: string) {
    setError(null)
    setArchivingId(itemId)
    startTransition(async () => {
      const result = await deleteMerchandiseItem(itemId)
      setArchivingId(null)
      if (result.error) {
        setError(result.error)
      } else {
        setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, is_active: false } : i))
      }
    })
  }

  const activeItems = items.filter((i) => i.is_active)
  const archivedItems = items.filter((i) => !i.is_active)

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add new item form */}
      {showNew && (
        <MerchItemForm
          onSaved={handleSaved}
          onCancel={() => setShowNew(false)}
        />
      )}

      {/* Active items */}
      {activeItems.length === 0 && !showNew ? (
        <div className="bg-white rounded-lg border border-dashed p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-700">No merchandise items yet</p>
            <p className="text-sm text-gray-400 mt-0.5">Create items like jerseys, hats, or bags to sell during registration.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add first item
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {activeItems.map((item) => (
            <div key={item.id}>
              {editingId === item.id ? (
                <MerchItemForm
                  item={item}
                  onSaved={handleSaved}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{item.name}</span>
                        <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                          ${(item.price_cents / 100).toFixed(2)} {item.currency.toUpperCase()}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                      )}

                      {item.variants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.variants.map((v) => (
                            <span
                              key={v.id}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                            >
                              {v.label}
                              {v.stock_quantity != null && (
                                <span className="text-gray-400">· {v.stock_quantity} left</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {item.variants.length === 0 && (
                        <p className="text-xs text-gray-400 mt-1">No size/variant options</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-md border hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(item.id)}
                        disabled={archivingId === item.id}
                        className="text-xs font-medium text-gray-400 hover:text-red-600 px-3 py-1.5 rounded-md border hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {archivingId === item.id ? 'Archiving…' : 'Archive'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add item button (when list has items) */}
      {activeItems.length > 0 && !showNew && (
        <button
          type="button"
          onClick={() => { setShowNew(true); setEditingId(null) }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors bg-white"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add item
        </button>
      )}

      {/* Archived items */}
      {archivedItems.length > 0 && (
        <details className="group">
          <summary className="text-xs font-medium text-gray-400 cursor-pointer hover:text-gray-600 transition-colors select-none list-none flex items-center gap-1">
            <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {archivedItems.length} archived item{archivedItems.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-3 space-y-2">
            {archivedItems.map((item) => (
              <div key={item.id} className="bg-gray-50 rounded-lg border p-4 opacity-60">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-700 text-sm">{item.name}</span>
                  <span className="text-xs text-gray-400">${(item.price_cents / 100).toFixed(2)}</span>
                  <span className="ml-auto text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Archived</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
