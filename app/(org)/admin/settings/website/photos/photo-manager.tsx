'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { uploadOrgPhoto, deleteOrgPhoto, updatePhotoCaption, reorderOrgPhotos, rotateOrgPhoto, togglePhotoFeatured } from '@/actions/org-photos'

type Photo = { id: string; url: string; caption: string | null; display_order: number; featured: boolean }

type UploadItem = {
  file: File
  previewUrl: string
  status: 'pending' | 'active' | 'done' | 'error'
  errorMsg?: string
}

// ── Upload progress panel ─────────────────────────────────────────────────────

function UploadProgress({ items }: { items: UploadItem[] }) {
  const total      = items.length
  const done       = items.filter(i => i.status === 'done').length
  const errors     = items.filter(i => i.status === 'error').length
  const pct        = total > 0 ? Math.round((done / total) * 100) : 0
  const activeIdx  = items.findIndex(i => i.status === 'active')
  const currentNum = activeIdx !== -1 ? activeIdx + 1 : done

  return (
    <div className="space-y-3">
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

      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: errors > 0 && done === total ? '#ef4444' : 'var(--brand-primary, #f97316)',
          }}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map((item, i) => (
          <div key={i} className="relative shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
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
            {item.status === 'pending' && <div className="absolute inset-0 bg-black/50" />}
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

      {items.filter(i => i.status === 'error').map((item, i) => (
        <p key={i} className="text-xs text-red-500">{item.file.name}: {item.errorMsg}</p>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PhotoManager({ initialPhotos }: { initialPhotos: Photo[] }) {
  const [photos, setPhotos]                 = useState<Photo[]>(initialPhotos)
  const [uploadItems, setUploadItems]       = useState<UploadItem[] | null>(null)
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [rotatingId, setRotatingId]         = useState<string | null>(null)
  const [togglingId, setTogglingId]         = useState<string | null>(null)
  const [editingCaption, setEditingCaption] = useState<{ id: string; value: string } | null>(null)

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [dragId, setDragId]       = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Ref to each photo card element — used for hit-testing during pointer drag
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Pending long-press context (cleared once drag activates or pointer lifts early)
  const pendingRef = useRef<{
    id: string
    el: HTMLElement
    pointerId: number
    timer: ReturnType<typeof setTimeout>
    startX: number
    startY: number
  } | null>(null)

  // Keep a ref copy of dragId so the non-passive touchmove listener can read it
  const dragIdRef = useRef<string | null>(null)
  useEffect(() => { dragIdRef.current = dragId }, [dragId])

  // Prevent page scroll while a drag is in progress (non-passive, must be added imperatively)
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (dragIdRef.current) e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [])

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => { uploadItems?.forEach(i => URL.revokeObjectURL(i.previewUrl)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Upload ────────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    const items: UploadItem[] = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
    }))
    setUploadItems(items)

    const updated = [...items]
    for (let i = 0; i < files.length; i++) {
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
            { id: result.id!, url: result.url!, caption: null, display_order: prev.length, featured: false },
          ])
        }
      }
      setUploadItems([...updated])
    }

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

  // ── Rotate ───────────────────────────────────────────────────────────────

  async function handleRotate(id: string, direction: 'cw' | 'ccw') {
    setRotatingId(id)
    const result = await rotateOrgPhoto(id, direction)
    setRotatingId(null)
    if (result.error) {
      alert(result.error)
    } else if (result.url) {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, url: result.url! } : p))
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

  // ── Featured toggle ───────────────────────────────────────────────────────

  async function handleToggleFeatured(id: string, current: boolean) {
    setTogglingId(id)
    const result = await togglePhotoFeatured(id, !current)
    setTogglingId(null)
    if (result.error) {
      alert(result.error)
    } else {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, featured: !current } : p))
    }
  }

  // ── Pointer drag (mouse + touch) ──────────────────────────────────────────
  //
  // Strategy:
  //   • onPointerDown  → start a 250 ms long-press timer; record start position
  //   • onPointerMove  → if timer hasn't fired yet, cancel if finger moved > 8 px
  //                      (user is scrolling, not dragging); if drag is active,
  //                      hit-test bounding rects to find the hovered slot
  //   • timer fires    → setPointerCapture so all future events route here;
  //                      activate drag visuals
  //   • onPointerUp /
  //     onPointerCancel → commit reorder or cancel; clear all state

  function hitTest(x: number, y: number): string | null {
    for (const [id, el] of itemRefs.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
    }
    return null
  }

  async function commitReorder(fromId: string, toId: string) {
    const from = photos.findIndex(p => p.id === fromId)
    const to   = photos.findIndex(p => p.id === toId)
    if (from === -1 || to === -1) return
    const reordered = [...photos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const withOrders = reordered.map((p, i) => ({ ...p, display_order: i }))
    setPhotos(withOrders)
    await reorderOrgPhotos(withOrders.map(p => ({ id: p.id, display_order: p.display_order })))
  }

  function handlePointerDown(e: React.PointerEvent, id: string) {
    // Only respond to primary pointer (ignore secondary touches)
    if (!e.isPrimary) return
    const el = e.currentTarget as HTMLElement

    const timer = setTimeout(() => {
      const p = pendingRef.current
      if (!p) return
      try { p.el.setPointerCapture(p.pointerId) } catch { /* pointer already gone */ }
      setDragId(id)
      setDragOverId(id)
    }, 250)

    pendingRef.current = {
      id,
      el,
      pointerId: e.pointerId,
      timer,
      startX: e.clientX,
      startY: e.clientY,
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!e.isPrimary) return
    const pending = pendingRef.current
    if (!pending) return

    if (!dragId) {
      // Drag hasn't activated yet — cancel if the finger has moved too much
      const dx = Math.abs(e.clientX - pending.startX)
      const dy = Math.abs(e.clientY - pending.startY)
      if (dx > 8 || dy > 8) {
        clearTimeout(pending.timer)
        pendingRef.current = null
      }
      return
    }

    // Drag is active — find which slot is under the pointer
    const over = hitTest(e.clientX, e.clientY)
    if (over) setDragOverId(over)
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!e.isPrimary) return
    const pending = pendingRef.current
    if (pending) {
      clearTimeout(pending.timer)
      pendingRef.current = null

      if (dragId && dragOverId && dragId !== dragOverId) {
        commitReorder(dragId, dragOverId)
      }
    }
    setDragId(null)
    setDragOverId(null)
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
                JPEG, PNG, WebP, or GIF · max 10 MB each · upload multiple at once
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
      ) : photos.length > 0 && (
        <div>
          {/* Hint — different text for touch vs mouse */}
          <p className="text-xs text-gray-400 mb-3">
            <span className="hidden sm:inline">Drag to reorder · </span>
            <span className="sm:hidden">Hold to reorder · </span>
            {photos.length} photo{photos.length !== 1 ? 's' : ''} · ⭐ {photos.filter(p => p.featured).length} featured on home page
          </p>

          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            // Cursor feedback during active drag
            style={{ cursor: dragId ? 'grabbing' : undefined }}
          >
            {photos.map((photo) => {
              const isBeingDragged = dragId === photo.id
              const isDropTarget   = dragOverId === photo.id && dragId !== photo.id
              const isEditingThisCaption = editingCaption?.id === photo.id

              return (
                <div
                  key={photo.id}
                  ref={el => { if (el) itemRefs.current.set(photo.id, el); else itemRefs.current.delete(photo.id) }}
                  onPointerDown={e => handlePointerDown(e, photo.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  // touch-action none only during active drag (set on the element
                  // the pointer is captured to). Before drag, default touch-action
                  // allows the page to scroll when the user touches a photo.
                  style={{ touchAction: isBeingDragged ? 'none' : undefined, userSelect: 'none' }}
                  className={[
                    'group relative rounded-xl overflow-hidden border-2 transition-all',
                    isBeingDragged ? 'opacity-40 scale-95 cursor-grabbing border-transparent' : 'cursor-grab',
                    isDropTarget ? 'border-orange-400 scale-[0.98]' : 'border-transparent',
                  ].join(' ')}
                >
                  {/* Image */}
                  <div className="aspect-square bg-gray-100 pointer-events-none">
                    <Image
                      src={photo.url}
                      alt={photo.caption ?? 'Gallery photo'}
                      width={400}
                      height={400}
                      className="w-full h-full object-cover"
                      unoptimized
                      draggable={false}
                    />
                  </div>

                  {/* Featured badge — always visible top-left */}
                  {photo.featured && (
                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                      <span className="text-sm leading-none drop-shadow-sm" title="Featured on home page">⭐</span>
                    </div>
                  )}

                  {/* Rotating spinner overlay */}
                  {rotatingId === photo.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                      <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    </div>
                  )}

                  {/* ── Desktop: hover overlay (hidden on touch screens) ── */}
                  <div className="hidden sm:flex absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors items-end pointer-events-none group-hover:pointer-events-auto">
                    <div className="w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform space-y-1.5">
                      {isEditingThisCaption ? (
                        <div className="flex gap-1" onPointerDown={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingCaption!.value}
                            onChange={e => setEditingCaption({ id: photo.id, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') handleCaptionSave(); if (e.key === 'Escape') setEditingCaption(null) }}
                            className="flex-1 text-xs px-2 py-1 rounded bg-white/90 text-gray-800 focus:outline-none"
                            placeholder="Add caption…"
                            maxLength={100}
                          />
                          <button onClick={handleCaptionSave} className="px-2 py-1 text-xs bg-white/90 text-gray-800 rounded font-medium hover:bg-white">
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
                      <div className="flex items-center gap-1">
                        {/* Featured toggle */}
                        <button
                          onClick={() => handleToggleFeatured(photo.id, photo.featured)}
                          disabled={togglingId === photo.id}
                          className={[
                            'flex-1 text-xs text-center py-0.5 rounded hover:bg-white/10 disabled:opacity-40 transition-colors',
                            photo.featured ? 'text-yellow-300' : 'text-white/60 hover:text-white',
                          ].join(' ')}
                          title={photo.featured ? 'Remove from home page' : 'Feature on home page'}
                        >
                          ⭐
                        </button>
                        {/* Rotate CCW */}
                        <button
                          onClick={() => handleRotate(photo.id, 'ccw')}
                          disabled={rotatingId === photo.id}
                          className="flex-1 text-xs text-white/80 hover:text-white disabled:opacity-40 text-center py-0.5 rounded hover:bg-white/10"
                          title="Rotate left"
                        >
                          ↺
                        </button>
                        {/* Rotate CW */}
                        <button
                          onClick={() => handleRotate(photo.id, 'cw')}
                          disabled={rotatingId === photo.id}
                          className="flex-1 text-xs text-white/80 hover:text-white disabled:opacity-40 text-center py-0.5 rounded hover:bg-white/10"
                          title="Rotate right"
                        >
                          ↻
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(photo.id)}
                          disabled={deletingId === photo.id}
                          className="flex-1 text-xs text-red-300 hover:text-red-200 disabled:opacity-50 text-center py-0.5 rounded hover:bg-white/10"
                          title="Remove"
                        >
                          {deletingId === photo.id ? '…' : '✕'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── Mobile: always-visible bottom action bar ── */}
                  <div className="sm:hidden absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-6 pb-2 px-2 pointer-events-none">
                    <div className="flex items-end justify-between gap-1 pointer-events-auto">
                      {/* Caption area */}
                      <div className="flex-1 min-w-0" onPointerDown={e => e.stopPropagation()}>
                        {isEditingThisCaption ? (
                          <div className="flex gap-1">
                            <input
                              autoFocus
                              value={editingCaption!.value}
                              onChange={e => setEditingCaption({ id: photo.id, value: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') handleCaptionSave(); if (e.key === 'Escape') setEditingCaption(null) }}
                              className="flex-1 text-xs px-2 py-1 rounded bg-white/90 text-gray-800 focus:outline-none min-w-0"
                              placeholder="Add caption…"
                              maxLength={100}
                            />
                            <button onClick={handleCaptionSave} className="px-2 py-1 text-xs bg-white/90 text-gray-800 rounded font-medium">
                              ✓
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingCaption({ id: photo.id, value: photo.caption ?? '' })}
                            className="text-left text-xs text-white/80 truncate w-full"
                          >
                            {photo.caption || '+ caption'}
                          </button>
                        )}
                      </div>

                      {/* Rotate + Delete + Featured buttons */}
                      {!isEditingThisCaption && (
                        <div className="flex items-center gap-1 shrink-0" onPointerDown={e => e.stopPropagation()}>
                          {/* Featured toggle */}
                          <button
                            onClick={() => handleToggleFeatured(photo.id, photo.featured)}
                            disabled={togglingId === photo.id}
                            className={[
                              'w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-sm disabled:opacity-50',
                              photo.featured ? 'text-yellow-300' : 'text-white/60',
                            ].join(' ')}
                            aria-label={photo.featured ? 'Remove from home page' : 'Feature on home page'}
                          >
                            ⭐
                          </button>
                          {/* Rotate CCW */}
                          <button
                            onClick={() => handleRotate(photo.id, 'ccw')}
                            disabled={rotatingId === photo.id || deletingId === photo.id}
                            className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white text-sm disabled:opacity-50"
                            aria-label="Rotate left"
                          >
                            ↺
                          </button>
                          {/* Rotate CW */}
                          <button
                            onClick={() => handleRotate(photo.id, 'cw')}
                            disabled={rotatingId === photo.id || deletingId === photo.id}
                            className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white text-sm disabled:opacity-50"
                            aria-label="Rotate right"
                          >
                            ↻
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(photo.id)}
                            disabled={deletingId === photo.id || rotatingId === photo.id}
                            className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center disabled:opacity-50"
                            aria-label="Remove photo"
                          >
                            {deletingId === photo.id ? (
                              <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
