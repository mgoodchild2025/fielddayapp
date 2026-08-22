'use client'

import { useRef, useState, useTransition } from 'react'
import { saveMyBio, uploadBioPhoto } from '@/actions/player-bios'
import { type BioCardData } from './player-bio-card'
import { BioFlipCard } from './bio-flip-card'
import type { PlayerCareer } from '@/lib/career'

/**
 * "My bio card" (S1): the player edits the exact card the TV will show —
 * live preview above the fields, opt-in toggle for displays front and centre.
 */

export interface BioEditorInitial {
  jerseyNumber: string | null
  position: string | null
  hometown: string | null
  yearsPlaying: number | null
  tagline: string | null
  showOnDisplays: boolean
  heroPhotoUrl: string | null
}

export function BioEditor({
  initial,
  playerName,
  avatarUrl,
  medalShelf,
  positions,
  career = null,
}: {
  initial: BioEditorInitial
  playerName: string
  avatarUrl: string | null
  medalShelf: string | null
  positions: string[]
  /** Career record for the card back — the preview flips like the real card. */
  career?: PlayerCareer | null
}) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.heroPhotoUrl)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [jerseyNumber, setJerseyNumber] = useState(initial.jerseyNumber ?? '')
  const [position, setPosition] = useState(initial.position ?? '')
  const [hometown, setHometown] = useState(initial.hometown ?? '')
  const [yearsPlaying, setYearsPlaying] = useState(initial.yearsPlaying != null ? String(initial.yearsPlaying) : '')
  const [tagline, setTagline] = useState(initial.tagline ?? '')
  const [showOnDisplays, setShowOnDisplays] = useState(initial.showOnDisplays)

  const preview: BioCardData = {
    name: playerName,
    photoUrl: photoUrl ?? avatarUrl,
    position: position || null,
    jerseyNumber: jerseyNumber || null,
    hometown: hometown || null,
    yearsPlaying: yearsPlaying ? parseInt(yearsPlaying) : null,
    tagline: tagline || null,
    medalShelf,
  }

  async function handlePhoto(file: File) {
    setErr(null)
    setUploading(true)
    const fd = new FormData()
    fd.append('photo', file)
    const r = await uploadBioPhoto(fd)
    setUploading(false)
    if (r.error) { setErr(r.error); return }
    setPhotoUrl(r.url)
  }

  function handleSave() {
    setErr(null)
    setSaved(false)
    startTransition(async () => {
      const r = await saveMyBio({
        jerseyNumber: jerseyNumber || null,
        position: position || null,
        hometown: hometown || null,
        yearsPlaying: yearsPlaying ? parseInt(yearsPlaying) : null,
        tagline: tagline || null,
        showOnDisplays,
      })
      if (r.error) { setErr(r.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Bio Card</p>
        <p className="text-xs text-gray-400 mt-0.5">The card shown when someone taps your name — and on event screens, if you opt in.</p>
      </div>

      {/* Live preview — the real card: dark like the TV, flippable like the modal */}
      <div className="bg-gray-800/60 px-5 py-5">
        <BioFlipCard bio={preview} career={career} />
      </div>

      <div className="p-5 space-y-3">
        {err && <p className="text-sm text-red-500">{err}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs text-gray-500">Number
            <input value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)} maxLength={6} placeholder="7"
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500">Position
            {positions.length > 0 ? (
              <select value={position} onChange={(e) => setPosition(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-white">
                <option value="">—</option>
                {positions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={40} placeholder="Outside hitter"
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
            )}
          </label>
          <label className="text-xs text-gray-500">Hometown
            <input value={hometown} onChange={(e) => setHometown(e.target.value)} maxLength={60} placeholder="Scarborough, ON"
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500">Years playing
            <input type="number" min="0" max="99" value={yearsPlaying} onChange={(e) => setYearsPlaying(e.target.value)}
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
          </label>
        </div>

        <label className="block text-xs text-gray-500">
          One good fact <span className="text-gray-300">({120 - tagline.length} left)</span>
          <input value={tagline} onChange={(e) => setTagline(e.target.value.slice(0, 120))}
            placeholder="Serves lefty, high-fives righty."
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f) }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-sm font-medium border rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {uploading ? 'Uploading…' : photoUrl ? 'Change card photo' : '📸 Add a card photo'}
          </button>
          <span className="text-xs text-gray-400">No photo? Your profile picture is used.</span>
        </div>

        <label className="flex items-start gap-2 pt-1 cursor-pointer">
          <input type="checkbox" checked={showOnDisplays} onChange={(e) => setShowOnDisplays(e.target.checked)} className="mt-0.5 rounded" />
          <span className="text-sm text-gray-700">
            <span className="font-medium">Show my card on event screens &amp; my share link</span>
            <span className="block text-xs text-gray-500">
              Event TVs can rotate through player cards, and your card&rsquo;s share link becomes viewable without
              logging in. Off by default — neither happens unless you turn this on.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={handleSave} disabled={isPending}
            className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}>
            {isPending ? 'Saving…' : 'Save bio'}
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </div>
    </div>
  )
}
