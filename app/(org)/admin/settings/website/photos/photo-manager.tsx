'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { uploadOrgPhoto, deleteOrgPhoto, updatePhotoCaption, reorderOrgPhotos } from '@/actions/org-photos'

type Photo = { id: string; url: string; caption: string | null; display_order: number }

type UploadItem = {
  file: File
  previewUrl: string
  status: 'pending' | 'active' | 'done' | 'error'
  errorMsg?: string
}

function UploadProgress({ items }: { items: UploadItem[] }) {
  const total     = items.length
  const done      = items.filter(i => i.status === 'done').length
  const errors    = items.filter(i => i.status === 'error').length
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0
  const activeIdx = items.findIndex(i => i.status === 'active')
  const currentNum = activeIdx !== -1 ? activeIdx + 1 : done

  return (
    <div className="space-y-3">
      {/* Label + counter */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700 truncate">
          {done < total
            ? 'Converting & uploading…'
            : errors > 0
              ? `Done — ${errors} photo${errors !== 1 ? 's' : ''} failed`
              : 'All photos uploaded!'}
        </p>
        <p className="text-sm text-gray-400 shrink-0 tabular-nums">
          {done < total ? `Photo ${currentNum} of ${total}` : `${done} of ${total}`}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: errors > 0 && done === total ? '#ef4444' : 'var(--brand-primary, #f97316)',
          }}
        />
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map((item, i) => (
          <div key={i} className="relative shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Status overlay */}
            {item.status === 'done' && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {item.status === 'active' && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            )}
            {item.status === 'pending' && (
              <div className="absolute inset-0 bg-black/50" />
            )}
            {item.status === 'error' && (
              <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Per-file errors */}
      {items.filter(i => i.status === 'error').map((item, i) => (
        <p key={i} className="text-xs text-red-500">{item.file.name}: {item.errorMsg}</p>
      ))}
    </div>
  )
}

export function PhotoManager({ initialPhotos }: { initialPhotos: Photo[] }) {
  const [photos, setPhotos]           = useState<Photo[]>(initialPhotos)
  const [uploadItems, setUploadItems] = useState<UploadItem[] | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [editingCaption, setEditingCaption] = useState<{ id: string; value: string } | null>(null)
  const [dragId, setDragId]           = useState<string | null>(null)
  const [dragOverId, setDragOverId]   = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Revoke object URLs on unmount / when items change
  useEffect(() => {
    return () => {
      uploadItems?.forEach(i => URL.revokeObjectURL(i.previewUrl))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Build initial queue with local previews
    const items: UploadItem[] = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
    }))
    setUploadItems(items)

    const updated = [...items]

    for (let i = 0; i < files.length; i++) {
      // Mark current file as active
      updated[i] = { ...updated[i], status: 'active' }
      setUploadItems([...updated])

      const fd = new FormData()
      fd.append('photo', files[i])
      const result = await uploadOrgPhoto(fd)

      if (result.error) {
        updated[i] = { ...updated[i], status: 'error', errorMsg: result.error }
      } else {
        updated[i] = { ...updated[i], status: 'done' }
        if (result.id && result.url) {
          setPhotos(prev => [
            ...prev,
            { id: result.id!, url: result.url!, caption: null, display_order: prev.length },
          ])
        }
      }
      setUploadItems([...updated])
    }

    // Collapse the progress panel after a short pause so the user sees completion
    setTimeout(() => {
      updated.forEach(i => URL.revokeObjectURL(i.previewUrl))
      setUploadItems(null)
    }, 2000)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Remove this photo from your gallery?')) return
    setDeletingId(id)
    const result = await deleteOrgPhoto(id)
    setDeletingId(null)
    if (result.error) {
      alert(result.error)
    } else {
      setPhotos(prev => prev.filter(p => p.id !== id))
    }
  }

  // ── Caption ───────────────────────────────────────────────────────────────

  async function handleCaptionSave() {
    if (!editingCaption) return
    await updatePhotoCaption(editingCaption.id, editingCaption.value)
    setPhotos(prev =>
      prev.map(p => p.id === editingCaption.id ? { ...p, caption: editingCaption.value || null } : p)
    )
    setEditingCaption(null)
  }

  // ── Drag-to-reorder ───────────────────────────────────────────────────────

  function handleDragStart(id: string) { setDragId(id) }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    setDragOverId(id)
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }

    const from = photos.findIndex(p => p.id === dragId)
    const to   = photos.findIndex(p => p.id === targetId)
    if (from === -1 || to === -1) return

    const reordered = [...photos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const withOrders = reordered.map((p, i) => ({ ...p, display_order: i }))

    setPhotos(withOrders)
    setDragId(null)
    setDragOverId(null)

    await reorderOrgPhotos(withOrders.map(p => ({ id: p.id, display_order: p.display_order })))
  }

  const isUploading = uploadItems !== null && uploadItems.some(i => i.status === 'pending' || i.status === 'active')

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="bg-white rounded-lg border p-5">
        {uploadItems ? (
          <UploadProgress items={uploadItems} />
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Upload Photos</h2>
              <p className="text-sm text-gray-500 mt-1">
                JPEG, PNG, WebP, or GIF · max 5 MB each · upload multiple at once
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 transition-colors"
            >
              + Add Photos
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>

      {/* Gallery grid */}
      {photos.length === 0 && !uploadItems ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-xl">
          <p className="text-lg">No photos yet</p>
          <p className="text-sm mt-1">Upload photos to display a gallery on your public site.</p>
        </div>
      ) : (
        photos.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-3">Drag to reorder · {photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  draggable
                  onDragStart={() => handleDragStart(photo.id)}
                  onDragOver={(e) => handleDragOver(e, photo.id)}
                  onDrop={() => handleDrop(photo.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                  className={[
                    'group relative rounded-xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing',
                    dragOverId === photo.id && dragId !== photo.id
                      ? 'border-orange-400 scale-[0.98]'
                      : 'border-transparent',
                    dragId === photo.id ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {/* Image */}
                  <div className="aspect-square bg-gray-100">
                    <Image
                      src={photo.url}
                      alt={photo.caption ?? 'Gallery photo'}
                      width={400}
                      height={400}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>

                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                    <div className="w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform space-y-1.5">
                      {/* Caption */}
                      {editingCaption?.id === photo.id ? (
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingCaption.value}
                            onChange={e => setEditingCaption({ id: photo.id, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') handleCaptionSave(); if (e.key === 'Escape') setEditingCaption(null) }}
                            className="flex-1 text-xs px-2 py-1 rounded bg-white/90 text-gray-800 focus:outline-none"
                            placeholder="Add caption…"
                            maxLength={100}
                          />
                          <button
                            onClick={handleCaptionSave}
                            className="px-2 py-1 text-xs bg-white/90 text-gray-800 rounded font-medium hover:bg-white"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingCaption({ id: photo.id, value: photo.caption ?? '' })}
                          className="w-full text-left text-xs text-white/80 hover:text-white truncate px-1"
                        >
                          {photo.caption || '+ Add caption'}
                        </button>
                      )}
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(photo.id)}
                        disabled={deletingId === photo.id}
                        className="w-full text-xs text-red-300 hover:text-red-200 disabled:opacity-50 text-left px-1"
                      >
                        {deletingId === photo.id ? 'Removing…' : '✕ Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
