'use client'

import { useState, useRef, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateProfile } from '@/actions/auth'
import { uploadPlayerAvatar } from '@/actions/profiles'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type PlayerDetails = Database['public']['Tables']['player_details']['Row']

const schema = z.object({
  full_name: z.string().min(2),
  phone: z.string().optional(),
  sms_opted_in: z.boolean().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'competitive']).optional(),
  t_shirt_size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']).optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function ProfileForm({
  profile,
  playerDetails,
  orgId,
}: {
  profile: Profile | null
  playerDetails: PlayerDetails | null
  orgId: string
}) {
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null)
  const [avatarUploading, startAvatarUpload] = useTransition()
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Display name for avatar fallback — may update live if user edits full_name
  const displayName = profile?.full_name ?? ''

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
      sms_opted_in: profile?.sms_opted_in ?? false,
      skill_level: (playerDetails?.skill_level as FormData['skill_level']) ?? undefined,
      t_shirt_size: (playerDetails?.t_shirt_size as FormData['t_shirt_size']) ?? undefined,
      emergency_contact_name: playerDetails?.emergency_contact_name ?? '',
      emergency_contact_phone: playerDetails?.emergency_contact_phone ?? '',
    },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError(null)
    const result = await updateProfile({ ...data, orgId })
    if (result.error) {
      setServerError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setLoading(false)
  }

  function handleAvatarClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)

    // Show an instant local preview while uploading
    const localUrl = URL.createObjectURL(file)
    setAvatarUrl(localUrl)

    const fd = new FormData()
    fd.append('avatar', file)

    startAvatarUpload(async () => {
      const result = await uploadPlayerAvatar(fd)
      if (result.error) {
        setAvatarError(result.error)
        // Revert to previous avatar on error
        setAvatarUrl(profile?.avatar_url ?? null)
      } else if (result.url) {
        setAvatarUrl(result.url)
      }
      // Reset input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
          Profile saved.
        </div>
      )}
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {serverError}
        </div>
      )}

      {/* ── Avatar section ── */}
      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-4">Profile Photo</h2>
        <div className="flex items-center gap-5">
          {/* Clickable avatar circle */}
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={avatarUploading}
            className="relative group shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60"
            title="Change photo"
          >
            <PlayerAvatar avatarUrl={avatarUrl} name={displayName} size="lg" />
            {/* Hover overlay */}
            <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {avatarUploading ? (
                <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </span>
          </button>

          <div>
            <p className="text-sm font-medium text-gray-700">
              {avatarUploading ? 'Uploading…' : 'Click your photo to change it'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG, WebP or GIF · max 5 MB</p>
            {avatarError && (
              <p className="text-xs text-red-600 mt-1">{avatarError}</p>
            )}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Basic Info ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Basic Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input {...register('full_name')} type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
            {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input {...register('phone')} type="tel" className="w-full border rounded-md px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input {...register('sms_opted_in')} type="checkbox" className="rounded" />
              <span className="text-xs text-gray-600">Receive SMS game reminders</span>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level</label>
            <select {...register('skill_level')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select…</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="competitive">Competitive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">T-Shirt Size</label>
            <select {...register('t_shirt_size')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select…</option>
              {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Emergency Contact ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Emergency Contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              {...register('emergency_contact_name')}
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              {...register('emergency_contact_phone')}
              type="tel"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  )
}
