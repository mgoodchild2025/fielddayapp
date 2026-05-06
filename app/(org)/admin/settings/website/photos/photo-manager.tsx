'use client'

import { useState, useRef, useTransition } from 'react'
import Image from 'next/image'
import { uploadOrgPhoto, deleteOrgPhoto, updatePhotoCaption, reorderOrgPhotos } from '@/actions/org-photos'

type Photo = { id: string; url: string; caption: string | null; display_order: number }

export function PhotoManager({ initialPhotos }: { initialPhotos: Photo[] }) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [uploading, startUpload] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingCaption, setEditingCaption] = useState<{ id: string; value: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Upload ────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploadError(null)

    startUpload(async () => {
      for (const file of files) {
        const fd = new FormData()
        fd.append('photo', file)
        const result = await uploadOrgPhoto(fd)
        if (result.error) {
          setUploadError(result.error)
          break
        }
        if (result.id && result.url) {
          setPhotos(prev => [
            ...prev,
            { id: result.id!, url: result.url!, caption: null, display_order: prev.length },
          ])
        }
      }
    })

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
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

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Upload Photos</h2>
            <p className="text-sm text-gray-500 mt-1">
              JPEG, PNG, WebP, or GIF · max 5 MB each · upload multiple at once
            </p>
            {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="shrink-0 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {uploading ? 'Uploading…' : '+ Add Photos'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Gallery grid */}
      {photos.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-xl">
          <p className="text-lg">No photos yet</p>
          <p className="text-sm mt-1">Upload photos to display a gallery on your public site.</p>
        </div>
      ) : (
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
      )}
    </div>
  )
}
