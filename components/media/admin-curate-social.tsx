'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { addCuratedSocialPost, removeCuratedSocialPost } from '@/actions/event-social'
import type { CuratedSocialPost } from '@/actions/event-social'

const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' }

export function AdminCurateSocial({ leagueId, posts }: { leagueId: string; posts: CuratedSocialPost[] }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!url.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await addCuratedSocialPost(leagueId, url.trim())
      if (res.error) setError(res.error)
      else { setUrl(''); router.refresh() }
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await removeCuratedSocialPost(id, leagueId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Featured social posts</h2>
        <p className="text-xs text-gray-400">Paste an Instagram, TikTok, or YouTube post link to feature it on the event gallery.</p>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="https://www.instagram.com/p/…   ·   tiktok.com/@…/video/…   ·   youtube link"
          className="flex-1 border rounded-md px-3 py-2 text-sm"
        />
        <button
          type="button" onClick={add} disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60 shrink-0"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Plus className="w-4 h-4" /> {pending ? 'Adding…' : 'Add'}
        </button>
      </div>

      {posts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {posts.map((p) => (
            <div key={p.id} className="rounded-lg border bg-white overflow-hidden">
              <a href={p.mediaUrl} target="_blank" rel="noopener noreferrer" className="relative block aspect-square bg-gray-100">
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnailUrl} alt={p.caption ?? 'Social post'} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl text-gray-300">🔗</span>
                )}
              </a>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                <button type="button" onClick={() => remove(p.id)} disabled={pending} className="text-gray-400 hover:text-red-600 disabled:opacity-40" aria-label="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
