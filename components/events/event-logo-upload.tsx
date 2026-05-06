'use client'

import { useRef, useState, useTransition } from 'react'
import { EventAvatar } from '@/components/ui/event-avatar'
import { uploadEventLogo, removeEventLogo } from '@/actions/events'

interface Props {
  leagueId: string
  logoUrl: string | null
  sport: string | null
  name: string
}

export function EventLogoUpload({ leagueId, logoUrl, sport, name }: Props) {
  const [preview, setPreview] = useState<string | null>(logoUrl)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('logo', file)
      const result = await uploadEventLogo(leagueId, fd)
      if (result.error) {
        setError(result.error)
      } else {
        setPreview(result.url)
      }
      // Reset input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await removeEventLogo(leagueId)
      if (result.error) {
        setError(result.error)
      } else {
        setPreview(null)
      }
    })
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-sm font-semibold mb-3">Event Logo</p>

      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={name} className="w-full h-full object-contain" />
          ) : (
            <EventAvatar logoUrl={null} name={name} sport={sport} size="lg" className="opacity-50" />
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 min-w-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
            disabled={pending}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
          >
            {pending ? 'Uploading…' : preview ? '↑ Replace logo' : '↑ Upload logo'}
          </button>
          {preview && !pending && (
            <button
              type="button"
              onClick={handleRemove}
              className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors text-left"
            >
              Remove
            </button>
          )}
          <p className="text-xs text-gray-400">JPEG, PNG, WebP, or SVG · Max 5 MB</p>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
