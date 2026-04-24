'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateProfile } from '@/actions/auth'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type PlayerDetails = Database['public']['Tables']['player_details']['Row']

const schema = z.object({
  full_name: z.string().min(2),
  phone: z.string().optional(),
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

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">Profile saved.</div>
      )}
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{serverError}</div>
      )}

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
              {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Emergency Contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input {...register('emergency_contact_name')} type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input {...register('emergency_contact_phone')} type="tel" className="w-full border rounded-md px-3 py-2 text-sm" />
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
