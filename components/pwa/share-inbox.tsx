'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { recordEventMediaUpload } from '@/actions/event-media'
import { uploadToCloudinary } from '@/lib/cloudinary-upload-client'

/**
 * /share — where photos and videos shared from the phone's share sheet land.
 * The root service worker parked the files in the Cache API
 * ('fieldday-share-inbox'); this page lists them, lets the player pick the
 * event, uploads each to Cloudinary (signed) and records it as pending media —
 * exactly what the event page's upload button does, minus the widget.
 */

const SHARE_CACHE = 'fieldday-share-inbox'
const INDEX_KEY = '/share-inbox/index'

interface InboxItem { id: string; name: string; type: string; size: number; text?: string }
interface Progress { state: 'queued' | 'uploading' | 'done' | 'error'; fraction: number; error?: string }

export interface ShareEventOption { id: string; name: string; slug: string; mine: boolean }

export function ShareInbox({
  events, orgId, cloudName, apiKey, configured, fallback, hadError,
}: {
  events: ShareEventOption[]
  orgId: string
  cloudName: string
  apiKey: string
  configured: boolean
  /** Server fallback hit: the worker wasn't ready, files were not kept. */
  fallback: boolean
  hadError: boolean
}) {
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [leagueId, setLeagueId] = useState<string>(events.find((e) => e.mine)?.id ?? events[0]?.id ?? '')
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    let urls: string[] = []
    ;(async () => {
      try {
        const cache = await caches.open(SHARE_CACHE)
        const idx = await cache.match(INDEX_KEY)
        const list: InboxItem[] = idx ? await idx.json() : []
        const p: Record<string, string> = {}
        for (const it of list) {
          if (!it.type.startsWith('image/')) continue
          const res = await cache.match(`/share-inbox/${it.id}`)
          if (res) { const u = URL.createObjectURL(await res.blob()); p[it.id] = u; urls.push(u) }
        }
        setPreviews(p)
        setItems(list)
        const firstText = list.find((i) => i.text)?.text
        if (firstText) setCaption(firstText.slice(0, 200))
      } catch {
        await Promise.resolve()
        setItems([])
      }
    })()
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = [] }
  }, [])

  async function removeItem(id: string) {
    const cache = await caches.open(SHARE_CACHE)
    await cache.delete(`/share-inbox/${id}`)
    const next = (items ?? []).filter((i) => i.id !== id)
    await cache.put(INDEX_KEY, new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }))
    setItems(next)
  }

  async function clearInbox() {
    try { await caches.delete(SHARE_CACHE) } catch { /* ignore */ }
  }

  async function uploadAll() {
    if (!items || items.length === 0 || !leagueId) return
    setBusy(true)
    const cache = await caches.open(SHARE_CACHE)
    const folder = `fieldday/${orgId}/events/${leagueId}`
    let ok = 0
    for (const it of items) {
      setProgress((p) => ({ ...p, [it.id]: { state: 'uploading', fraction: 0 } }))
      try {
        const res = await cache.match(`/share-inbox/${it.id}`)
        if (!res) throw new Error('File is no longer available.')
        const blob = await res.blob()
        const file = new File([blob], it.name, { type: it.type || blob.type })
        const up = await uploadToCloudinary(file, {
          cloudName, apiKey, folder,
          onProgress: (f) => setProgress((p) => ({ ...p, [it.id]: { state: 'uploading', fraction: f } })),
        })
        const thumb = up.resourceType === 'video'
          ? `https://res.cloudinary.com/${cloudName}/video/upload/so_0/${up.publicId}.jpg`
          : up.url
        const r = await recordEventMediaUpload({
          leagueId,
          publicId: up.publicId,
          url: up.url,
          thumbnailUrl: thumb,
          mediaType: up.resourceType,
          caption: caption.trim() || undefined,
          width: up.width,
          height: up.height,
          durationSeconds: up.durationSeconds,
        })
        if (r.error) throw new Error(r.error)
        await cache.delete(`/share-inbox/${it.id}`)
        ok++
        setProgress((p) => ({ ...p, [it.id]: { state: 'done', fraction: 1 } }))
      } catch (e) {
        setProgress((p) => ({ ...p, [it.id]: { state: 'error', fraction: 0, error: e instanceof Error ? e.message : 'Upload failed.' } }))
      }
    }
    const failed = items.filter((i) => (progress[i.id]?.state ?? 'queued') === 'error')
    if (failed.length === 0 && ok === items.length) {
      await clearInbox()
      setFinished(true)
    } else {
      // Keep only failed files in the inbox so a retry is possible.
      const keep = items.filter((i) => progress[i.id]?.state !== 'done')
      await cache.put(INDEX_KEY, new Response(JSON.stringify(keep), { headers: { 'content-type': 'application/json' } }))
      setItems(keep)
    }
    setBusy(false)
  }

  const event = events.find((e) => e.id === leagueId)

  if (finished) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center">
        <p className="text-3xl">📸</p>
        <h2 className="mt-2 font-semibold text-gray-900">Thanks! Your upload is pending approval.</h2>
        <p className="mt-1 text-sm text-gray-500">An admin will review it before it appears on the event page.</p>
        {event && (
          <Link href={`/events/${event.slug}`} className="mt-4 inline-block px-4 py-2 rounded-md text-sm font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
            Go to {event.name}
          </Link>
        )}
      </div>
    )
  }

  if (items === null) return <p className="text-sm text-gray-400">Loading shared files…</p>

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 space-y-3 text-sm text-gray-600">
        {fallback && (
          <p className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
            The app wasn&rsquo;t quite ready to receive files that time. It is now — share them again from your photos.
          </p>
        )}
        {hadError && (
          <p className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2">Something went wrong receiving those files. Try sharing them again.</p>
        )}
        <h2 className="font-semibold text-gray-900">Nothing shared yet</h2>
        <p>
          From your phone&rsquo;s photo app, pick the photos or videos from a game, tap <span className="font-semibold">Share</span>, and choose this app.
          They&rsquo;ll show up here so you can send them to the right event.
        </p>
        <p className="text-xs text-gray-400">Sharing into the app only works once it&rsquo;s installed on your home screen.</p>
      </div>
    )
  }

  if (!configured) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">Media uploads aren&rsquo;t set up for this site yet. Ask your league admin.</div>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Event</span>
          <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)} disabled={busy}
            className="mt-1 w-full border rounded-md px-3 py-2 text-base bg-white">
            {events.map((e) => <option key={e.id} value={e.id}>{e.mine ? '★ ' : ''}{e.name}</option>)}
          </select>
          {events.length === 0 && <span className="block text-xs text-red-500 mt-1">No events are open for uploads right now.</span>}
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Caption <span className="text-gray-400 font-normal">(optional, applies to all)</span></span>
          <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 200))} disabled={busy} maxLength={200}
            className="mt-1 w-full border rounded-md px-3 py-2 text-base" placeholder="Semi-final, court 2" />
        </label>
      </div>

      <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map((it) => {
          const p = progress[it.id]
          return (
            <li key={it.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border">
              {previews[it.id]
                // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not optimizable
                ? <img src={previews[it.id]} alt={it.name} className="h-full w-full object-cover" />
                : <div className="h-full w-full grid place-items-center text-2xl">{it.type.startsWith('video/') ? '🎬' : '📄'}</div>}
              {p?.state === 'uploading' && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20"><div className="h-full bg-white" style={{ width: `${Math.round(p.fraction * 100)}%` }} /></div>
              )}
              {p?.state === 'done' && <div className="absolute inset-0 grid place-items-center bg-green-600/60 text-white text-2xl">✓</div>}
              {p?.state === 'error' && <div className="absolute inset-0 grid place-items-center bg-red-600/70 text-white text-[10px] p-1 text-center">{p.error}</div>}
              {!busy && !p && (
                <button type="button" onClick={() => removeItem(it.id)} aria-label="Remove"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white text-xs">×</button>
              )}
            </li>
          )
        })}
      </ul>

      <button type="button" onClick={uploadAll} disabled={busy || !leagueId || events.length === 0}
        className="w-full px-4 py-3 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}>
        {busy ? 'Uploading…' : `Upload ${items.length} file${items.length !== 1 ? 's' : ''} to ${event?.name ?? 'event'}`}
      </button>
      <p className="text-xs text-gray-400 text-center">Uploads are reviewed by an admin before they appear.</p>
    </div>
  )
}
