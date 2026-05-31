'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { goLive, endLive, type LiveStream } from '@/actions/live'

export function GoLivePanel({ current }: { current: LiveStream | null }) {
  const router = useRouter()
  const [platform, setPlatform] = useState<'youtube' | 'instagram' | 'other'>('youtube')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function start() {
    setError(null)
    startTransition(async () => {
      const res = await goLive({ platform, url: url.trim(), title: title.trim() || undefined })
      if (res.error) setError(res.error)
      else { setUrl(''); setTitle(''); router.refresh() }
    })
  }

  function stop() {
    setError(null)
    startTransition(async () => {
      const res = await endLive()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  if (current) {
    return (
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <h2 className="font-semibold">You&apos;re live</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{current.platform}</span>
        </div>

        {current.embed_url ? (
          <div className="relative w-full rounded-lg overflow-hidden border" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={current.embed_url}
              title={current.title ?? 'Live stream'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        ) : (
          <a href={current.url} target="_blank" rel="noopener noreferrer"
            className="block rounded-lg border bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
            🔴 {current.title ?? 'Watch the live stream'} → {current.url}
          </a>
        )}

        <p className="text-xs text-gray-500">
          This stream is showing on your public site, the Media page, and any TV display with a Live zone.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={stop} disabled={isPending}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50">
          {isPending ? 'Ending…' : 'End live stream'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Go Live</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Start your stream on YouTube or Instagram, then paste the link here to surface it across Fieldday.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
          <select value={platform} onChange={e => setPlatform(e.target.value as typeof platform)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white">
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-gray-400 font-normal">(optional)</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            placeholder="e.g. Championship Final"
            className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Live URL</label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder={platform === 'youtube' ? 'https://youtube.com/live/…' : 'https://instagram.com/…'}
          className="w-full border rounded-md px-3 py-2 text-sm" />
        {platform === 'instagram' && (
          <p className="text-xs text-gray-400 mt-1">
            Instagram Live can&apos;t be embedded, so we&apos;ll show a &ldquo;Watch live on Instagram&rdquo; link instead.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button onClick={start} disabled={isPending || !url.trim()}
        className="px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: '#dc2626' }}>
        {isPending ? 'Going live…' : '🔴 Go Live'}
      </button>
    </div>
  )
}
