'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { goLive, endLiveStream, type LiveStream } from '@/actions/live'

type EventOption = { id: string; name: string }

export function GoLivePanel({
  events,
  activeStreams,
}: {
  events: EventOption[]
  activeStreams: LiveStream[]
}) {
  const router = useRouter()
  const [platform, setPlatform] = useState<'youtube' | 'instagram' | 'other'>('youtube')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('') // '' = whole org, else leagueId
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const eventName = (id: string | null) => id ? (events.find(e => e.id === id)?.name ?? 'Event') : 'Whole organization'

  function start() {
    setError(null)
    startTransition(async () => {
      const res = await goLive({ platform, url: url.trim(), title: title.trim() || undefined, leagueId: scope || null })
      if (res.error) setError(res.error)
      else { setUrl(''); setTitle(''); router.refresh() }
    })
  }
  function stop(id: string) {
    startTransition(async () => { await endLiveStream(id); router.refresh() })
  }

  return (
    <div className="space-y-6">
      {/* Active streams */}
      {activeStreams.length > 0 && (
        <div className="bg-white rounded-lg border divide-y">
          <div className="px-5 py-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              Live now ({activeStreams.length})
            </h2>
          </div>
          {activeStreams.map(s => (
            <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.title ?? `${s.platform} stream`}</p>
                <p className="text-xs text-gray-400">
                  {eventName(s.league_id)} · {s.platform}
                  {s.detected_via === 'api' && ' · auto-detected'}
                </p>
              </div>
              <button onClick={() => stop(s.id)} disabled={isPending}
                className="text-xs font-medium px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50 shrink-0 disabled:opacity-50">
                End
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Go live form */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Go Live</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Start your stream on YouTube or Instagram, then paste the link here. Run a separate stream per event if you like.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Show on</label>
            <select value={scope} onChange={e => setScope(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white">
              <option value="">Whole organization</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value as typeof platform)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white">
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-gray-400 font-normal">(optional)</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            placeholder="e.g. Court 1 — Championship Final"
            className="w-full border rounded-md px-3 py-2 text-sm" />
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
          {isPending ? 'Going live…' : `🔴 Go Live${scope ? ` — ${eventName(scope)}` : ''}`}
        </button>
      </div>
    </div>
  )
}
