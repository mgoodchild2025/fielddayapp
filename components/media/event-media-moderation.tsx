'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff, Trash2, RotateCcw } from 'lucide-react'
import { moderateEventMedia, deleteEventMedia } from '@/actions/event-media'
import type { EventMediaItem } from '@/actions/event-media'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  hidden: 'bg-gray-100 text-gray-500 border-gray-200',
}

export function EventMediaModeration({ items }: { items: EventMediaItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function run(id: string, fn: () => Promise<{ error: string | null }>) {
    setError(null); setBusyId(id)
    startTransition(async () => {
      const res = await fn()
      setBusyId(null)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  const pendingCount = items.filter((m) => m.status === 'pending').length

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400">
        No uploads yet. Player uploads will appear here for approval.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <p className="text-sm text-gray-500">
        {items.length} item{items.length !== 1 ? 's' : ''}
        {pendingCount > 0 && <span className="text-amber-600"> · {pendingCount} awaiting approval</span>}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((m) => (
          <div key={m.id} className="rounded-lg border bg-white overflow-hidden">
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.thumbnailUrl ?? m.url} alt={m.caption ?? 'Upload'} loading="lazy" className="h-full w-full object-cover" />
              {m.mediaType === 'video' && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Video</span>
              )}
            </a>
            <div className="p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_BADGE[m.status]}`}>{m.status}</span>
                {m.uploaderName && <span className="text-[10px] text-gray-400 truncate">{m.uploaderName}</span>}
              </div>
              <div className="flex items-center gap-1">
                {m.status !== 'approved' && (
                  <button type="button" onClick={() => run(m.id, () => moderateEventMedia(m.id, 'approve'))} disabled={busyId === m.id || pending}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-green-600 text-white text-xs font-medium py-1 disabled:opacity-50" title="Approve">
                    {m.status === 'hidden' ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {m.status === 'hidden' ? 'Restore' : 'Approve'}
                  </button>
                )}
                {m.status === 'approved' && (
                  <button type="button" onClick={() => run(m.id, () => moderateEventMedia(m.id, 'hide'))} disabled={busyId === m.id || pending}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border text-gray-600 text-xs font-medium py-1 hover:bg-gray-50 disabled:opacity-50" title="Hide">
                    <EyeOff className="w-3.5 h-3.5" /> Hide
                  </button>
                )}
                <button type="button" onClick={() => run(m.id, () => deleteEventMedia(m.id))} disabled={busyId === m.id || pending}
                  className="inline-flex items-center justify-center rounded-md border text-gray-400 hover:text-red-600 px-2 py-1 disabled:opacity-50" title="Delete">
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
