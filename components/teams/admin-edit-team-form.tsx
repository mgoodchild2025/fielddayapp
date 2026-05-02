'use client'

import { useState, useTransition, useRef } from 'react'
import { updateTeam, uploadTeamLogo } from '@/actions/teams'

interface Props {
  team: {
    id: string
    name: string
    color: string | null
    logo_url: string | null
  }
  leagueId: string
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#000000', '#6b7280',
]

export function AdminEditTeamForm({ team, leagueId }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(team.name)
  const [color, setColor] = useState(team.color ?? '#3b82f6')
  const [logoPreview, setLogoPreview] = useState<string | null>(team.logo_url)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setRemoveLogo(false)
    setLogoPreview(URL.createObjectURL(file))
  }

  function handleRemoveLogo() {
    setLogoFile(null)
    setLogoPreview(null)
    setRemoveLogo(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    setOpen(false)
    setError(null)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      let finalLogoUrl: string | null = removeLogo ? null : (logoPreview ?? team.logo_url)

      if (logoFile) {
        const fd = new FormData()
        fd.append('file', logoFile)
        const result = await uploadTeamLogo(team.id, fd)
        if (result.error) { setError(result.error); return }
        finalLogoUrl = result.url
      }

      const result = await updateTeam(team.id, leagueId, {
        name: name.trim() || team.name,
        color,
        logo_url: finalLogoUrl,
      })

      if (result.error) { setError(result.error); return }
      setLogoFile(null)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
        title="Edit team"
      >
        Edit
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-xl w-full max-w-sm mx-auto max-h-[90dvh] overflow-y-auto">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <p className="text-sm font-semibold">Edit Team</p>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Team Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? 'white' : 'transparent',
                        boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                      }}
                      title={c}
                    />
                  ))}
                  {/* Custom colour picker */}
                  <label
                    className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden"
                    title="Custom colour"
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="opacity-0 absolute w-0 h-0"
                    />
                    <span className="text-gray-400 text-xs leading-none">+</span>
                  </label>
                  <div className="w-7 h-7 rounded-full border" style={{ backgroundColor: color }} />
                </div>
              </div>

              {/* Logo */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Team Logo</label>
                {logoPreview ? (
                  <div className="flex items-center gap-3 mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="w-16 h-16 rounded-lg object-contain border bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mb-2">No logo uploaded.</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  onChange={handleFileChange}
                  className="w-full text-xs text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP or SVG · max 2 MB</p>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="px-5 py-4 border-t flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {pending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={pending}
                className="px-4 py-2 rounded-md text-sm font-semibold border hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
