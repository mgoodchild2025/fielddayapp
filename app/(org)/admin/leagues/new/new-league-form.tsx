'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createLeague } from '@/actions/leagues'
import { useRouter } from 'next/navigation'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  slug: z.string().min(2, 'Slug required').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  description: z.string().optional(),
  league_type: z.enum(['team', 'individual', 'dropin', 'tournament']),
  sport: z.string().default('beach_volleyball'),
  price_cents: z.coerce.number().min(0).default(0),
  payment_mode: z.enum(['per_player', 'per_team']).default('per_player'),
  max_teams: z.coerce.number().optional(),
  min_team_size: z.coerce.number().default(4),
  max_team_size: z.coerce.number().default(8),
  season_start_date: z.string().optional(),
  season_end_date: z.string().optional(),
  registration_opens_at: z.string().optional(),
  registration_closes_at: z.string().optional(),
  waiver_version_id: z.string().uuid().optional(),
})

type FormData = z.infer<typeof schema>

interface Waiver {
  id: string
  title: string
  version: number
}

interface Props {
  waivers: Waiver[]
}

export function NewLeagueForm({ waivers }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      league_type: 'team',
      sport: 'beach_volleyball',
      payment_mode: 'per_player',
      min_team_size: 4,
      max_team_size: 8,
      price_cents: 0,
    },
  })

  const nameValue = watch('name')

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    const result = await createLeague(data)
    if (result.error) {
      setError(result.error === 'UPGRADE_REQUIRED'
        ? 'Your plan only allows 1 active league. Upgrade to create more.'
        : result.error)
      setLoading(false)
    } else {
      router.push(`/admin/leagues/${result.data?.id}`)
    }
  }

  function Field({ label, name, type = 'text', children }: { label: string; name: keyof FormData; type?: string; children?: React.ReactNode }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {children ?? (
          <input
            {...register(name)}
            type={type}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
          />
        )}
        {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create League</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="League Name" name="name">
            <input
              {...register('name')}
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
              onChange={(e) => {
                setValue('name', e.target.value)
                setValue('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
              }}
            />
          </Field>
          <Field label="URL Slug" name="slug" />
        </div>

        <Field label="Description" name="description">
          <textarea
            {...register('description')}
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="League Type" name="league_type">
            <select {...register('league_type')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="team">Team</option>
              <option value="individual">Individual</option>
              <option value="dropin">Drop-in</option>
              <option value="tournament">Tournament</option>
            </select>
          </Field>
          <Field label="Sport" name="sport">
            <input {...register('sport')} type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (cents, 0 = free)" name="price_cents" type="number" />
          <Field label="Payment Mode" name="payment_mode">
            <select {...register('payment_mode')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="per_player">Per Player</option>
              <option value="per_team">Per Team</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Min Team Size" name="min_team_size" type="number" />
          <Field label="Max Team Size" name="max_team_size" type="number" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Season Start" name="season_start_date" type="date" />
          <Field label="Season End" name="season_end_date" type="date" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Registration Opens" name="registration_opens_at" type="datetime-local" />
          <Field label="Registration Closes" name="registration_closes_at" type="datetime-local" />
        </div>

        <Field label="Waiver" name="waiver_version_id">
          <select {...register('waiver_version_id')} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">No waiver required</option>
            {waivers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} (v{w.version})
              </option>
            ))}
          </select>
          {waivers.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No waivers set up yet.{' '}
              <a href="/admin/settings/waivers" className="underline">Create one in Settings → Waivers</a> first.
            </p>
          )}
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Creating…' : 'Create League'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2.5 rounded-md font-semibold border text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
