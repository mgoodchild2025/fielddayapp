'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff, Trash2, RotateCcw, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cloudinaryThumb } from '@/lib/cloudinary-url'
import { EmptyState } from '@/components/ui/empty-state'
import { moderateEventMedia, deleteEventMedia } from '@/actions/event-media'
import type { EventMediaItem } from '@/actions/event-media'
import { useUndoableRemove } from '@/components/ui/use-undoable-remove'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  hidden: 'bg-gray-100 text-gray-500 border-gray-200',
}

export function EventMediaModeration({ items }: { items: EventMediaItem[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  // Per item: approving one photo no longer freezes every other button.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [approvingAll, setApprovingAll] = useState(false)
  const setItemBusy = (id: string, on: boolean) =>
    setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n })
  // Delete also removes the file from Cloudinary, so it only runs once the
  // Undo window closes — a stray tap on the bin is one tap to take back.
  const { remove, isHidden } = useUndoableRemove()

  async function run(id: string, fn: () => Promise<{ error: string | null }>) {
    setError(null); setItemBusy(id, true)
    const res = await fn()
    setItemBusy(id, false)
    if (res.error) setError(res.error)
    else router.refresh()
  }

  // The pending-media text alert lands admins here after a 20-photo burst.
  async function approveAll(ids: string[]) {
    setError(null); setApprovingAll(true)
    let failed = 0
    for (const id of ids) {
      const res = await moderateEventMedia(id, 'approve')
      if (res.error) failed++
    }
    setApprovingAll(false)
    router.refresh()
    if (failed) toast.error(`${failed} of ${ids.length} couldn't be approved`)
    else toast.success(`Approved ${ids.length} upload${ids.length === 1 ? '' : 's'}`)
  }

  const visible = items.filter((m) => !isHidden(m.id))
  const pendingCount = visible.filter((m) => m.status === 'pending').length

  if (visible.length === 0) {
    return <EmptyState icon={ImageIcon} title="No uploads yet" hint="Player photos and videos appear here for approval." />
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {visible.length} item{visible.length !== 1 ? 's' : ''}
          {pendingCount > 0 && <span className="text-amber-700"> · {pendingCount} awaiting approval</span>}
        </p>
        {pendingCount > 1 && (
          <button
            type="button"
            onClick={() => approveAll(visible.filter((m) => m.status === 'pending').map((m) => m.id))}
            disabled={approvingAll}
            className="press inline-flex items-center gap-1.5 min-h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> {approvingAll ? 'Approving…' : `Approve all ${pendingCount}`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((m) => (
          <div key={m.id} className="rounded-lg border bg-white overflow-hidden">
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cloudinaryThumb(m.thumbnailUrl ?? m.url, { width: 400, height: 400 })} alt={m.caption ?? 'Upload'} loading="lazy" className="h-full w-full object-cover" />
              {m.mediaType === 'video' && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Video</span>
              )}
            </a>
            <div className="p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_BADGE[m.status]}`}>{m.status}</span>
                {m.uploaderName && <span className="text-xs text-gray-500 truncate">{m.uploaderName}</span>}
              </div>
              <div className="flex items-center gap-2">
                {m.status !== 'approved' && (
                  <button type="button" onClick={() => run(m.id, () => moderateEventMedia(m.id, 'approve'))} disabled={busy.has(m.id) || approvingAll}
                    className="press flex-1 inline-flex items-center justify-center gap-1 min-h-10 rounded-md bg-green-600 text-white text-xs font-medium disabled:opacity-50" title="Approve">
                    {m.status === 'hidden' ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {m.status === 'hidden' ? 'Restore' : 'Approve'}
                  </button>
                )}
                {m.status === 'approved' && (
                  <button type="button" onClick={() => run(m.id, () => moderateEventMedia(m.id, 'hide'))} disabled={busy.has(m.id) || approvingAll}
                    className="press flex-1 inline-flex items-center justify-center gap-1 min-h-10 rounded-md border text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50" title="Hide">
                    <EyeOff className="w-3.5 h-3.5" /> Hide
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(m.id, {
                    label: m.mediaType === 'video' ? 'Video deleted' : 'Photo deleted',
                    commit: () => deleteEventMedia(m.id),
                    onCommitted: () => router.refresh(),
                  })}
                  disabled={busy.has(m.id) || approvingAll}
                  className="press inline-flex items-center justify-center min-h-10 min-w-10 rounded-md border text-gray-500 hover:text-red-600 disabled:opacity-50" title="Delete" aria-label="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
