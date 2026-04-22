'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createRegistration } from '@/actions/registrations'
import { updateProfile } from '@/actions/auth'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type PlayerDetails = Database['public']['Tables']['player_details']['Row']
type League = Database['public']['Tables']['leagues']['Row']

const schema = z.object({
  full_name: z.string().min(2, 'Full name required'),
  email: z.string().email(),
  phone: z.string().min(10, 'Phone number required'),
  skill_level: z.enum(['beginner', 'intermediate', 'competitive']),
  t_shirt_size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  emergency_contact_name: z.string().min(2, 'Emergency contact name required'),
  emergency_contact_phone: z.string().min(10, 'Emergency contact phone required'),
  how_did_you_hear: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  org: { id: string; name: string }
  profile: Profile | null
  playerDetails: PlayerDetails | null
  league: League
  userId: string
  onComplete: (registrationId: string) => void
}

export function Step1PlayerDetails({ org, profile, playerDetails, league, userId, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
      skill_level: (playerDetails?.skill_level as FormData['skill_level']) ?? undefined,
      t_shirt_size: (playerDetails?.t_shirt_size as FormData['t_shirt_size']) ?? undefined,
      emergency_contact_name: playerDetails?.emergency_contact_name ?? '',
      emergency_contact_phone: playerDetails?.emergency_contact_phone ?? '',
      how_did_you_hear: playerDetails?.how_did_you_hear ?? '',
    },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)

    await updateProfile({ ...data, orgId: org.id })

    const result = await createRegistration({ leagueId: league.id })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    onComplete(result.data!.registrationId)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Your Info</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Full Name', name: 'full_name' as keyof FormData, type: 'text' },
            { label: 'Email', name: 'email' as keyof FormData, type: 'email' },
            { label: 'Phone', name: 'phone' as keyof FormData, type: 'tel' },
          ].map(({ label, name, type }) => (
            <div key={name} className={name === 'full_name' ? 'col-span-2' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input {...register(name)} type={type} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level *</label>
            <select {...register('skill_level')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select…</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="competitive">Competitive</option>
            </select>
            {errors.skill_level && <p className="text-red-500 text-xs mt-1">{errors.skill_level.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">T-Shirt Size *</label>
            <select {...register('t_shirt_size')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select…</option>
              {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {errors.t_shirt_size && <p className="text-red-500 text-xs mt-1">{errors.t_shirt_size.message}</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">Emergency Contact</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Name', name: 'emergency_contact_name' as keyof FormData, type: 'text' },
            { label: 'Phone', name: 'emergency_contact_phone' as keyof FormData, type: 'tel' },
          ].map(({ label, name, type }) => (
            <div key={name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input {...register(name)} type={type} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">How did you hear about us?</label>
          <input {...register('how_did_you_hear')} type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Saving…' : 'Continue to Waiver →'}
      </button>
    </form>
  )
}
