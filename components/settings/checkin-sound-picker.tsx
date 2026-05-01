'use client'

import { useState, useTransition } from 'react'
import { updateCheckinSound } from '@/actions/branding'
import { CHECKIN_SOUNDS, unlockAudio, playCheckinSound } from '@/lib/audio'

interface Props {
  currentSound: string | null
  orgId: string
}

export function CheckinSoundPicker({ currentSound, orgId }: Props) {
  const [selected, setSelected] = useState<string | null>(currentSound)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSelect(id: string | null) {
    unlockAudio()
    setSelected(id)
    setSaved(false)
  }

  function handlePreview(id: string | null) {
    unlockAudio()
    playCheckinSound(id)
  }

  function handleSave() {
    setSaveError(null)
    startTransition(async () => {
      const result = await updateCheckinSound(orgId, selected)
      if (result.error) {
        setSaveError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="bg-white rounded-lg border p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Check-In Sound</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Plays when a player is successfully checked in via QR scanner. Off by default.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {CHECKIN_SOUNDS.map((s) => (
          <div key={String(s.id)} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <label className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0">
              <input
                type="radio"
                name="checkin-sound"
                checked={selected === s.id}
                onChange={() => handleSelect(s.id)}
                className="accent-current shrink-0"
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{s.label}</p>
                <p className="text-xs text-gray-400">{s.description}</p>
              </div>
            </label>

            {s.id !== null && (
              <button
                type="button"
                onClick={() => handlePreview(s.id)}
                className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                {/* Play icon */}
                <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16">
                  <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                </svg>
                Preview
              </button>
            )}
          </div>
        ))}
      </div>

      {saveError && (
        <p className="text-sm text-red-500">{saveError}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Save Sound'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">✓ Saved</span>
        )}
      </div>
    </div>
  )
}
