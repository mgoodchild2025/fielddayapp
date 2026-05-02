'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addGame } from '@/actions/schedule'

const schema = z.object({
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
  homeTeamLabel: z.string().optional(),
  awayTeamLabel: z.string().optional(),
  scheduledAt: z.string().min(1, 'Date and time required'),
  court: z.string().optional(),
  weekNumber: z.number().optional(),
}).refine(
  (d) => {
    const hId = d.homeTeamId || ''
    const aId = d.awayTeamId || ''
    return !hId || !aId || hId !== aId
  },
  { message: 'Home and away teams must be different', path: ['awayTeamId'] }
)

type FormData = z.infer<typeof schema>

function venueLabel(sport?: string): string {
  if (sport === 'hockey') return 'Rink'
  if (['baseball', 'softball', 'soccer', 'flag_football', 'ultimate_frisbee'].includes(sport ?? '')) return 'Field'
  return 'Court'
}

interface Props {
  leagueId: string
  sport?: string
  teams: { id: string; name: string }[]
}

export function AddGameForm({ leagueId, sport, teams }: Props) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const homeTeamId = watch('homeTeamId')
  const awayTeamId = watch('awayTeamId')
  const homeTbd = !homeTeamId
  const awayTbd = !awayTeamId

  async function onSubmit(data: FormData) {
    setLoading(true)
    setSuccess(false)
    setServerError(null)
    // Convert datetime-local string (treated as local time by the browser) to UTC ISO
    const scheduledAtUtc = data.scheduledAt
      ? new Date(data.scheduledAt).toISOString()
      : data.scheduledAt
    const result = await addGame({
      leagueId,
      homeTeamId: data.homeTeamId || undefined,
      awayTeamId: data.awayTeamId || undefined,
      homeTeamLabel: homeTbd ? (data.homeTeamLabel || undefined) : undefined,
      awayTeamLabel: awayTbd ? (data.awayTeamLabel || undefined) : undefined,
      scheduledAt: scheduledAtUtc,
      court: data.court,
      weekNumber: data.weekNumber,
    })
    if (result.error) {
      setServerError(result.error)
    } else {
      setSuccess(true)
      reset()
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold mb-3 text-sm">Add Game</h3>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-xs mb-3">
          Game added successfully.
        </div>
      )}
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs mb-3">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date & Time</label>
          <input
            {...register('scheduledAt')}
            type="datetime-local"
            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          />
          {errors.scheduledAt && (
            <p className="text-red-500 text-xs mt-0.5">{errors.scheduledAt.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Home Team</label>
          <select {...register('homeTeamId')} className="w-full border rounded px-2 py-1.5 text-sm">
            <option value="">TBD</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {homeTbd && (
            <input
              {...register('homeTeamLabel')}
              type="text"
              placeholder="Label (e.g. Pool A Winner)"
              className="w-full border rounded px-2 py-1.5 text-sm mt-1 text-gray-500"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Away Team</label>
          <select {...register('awayTeamId')} className="w-full border rounded px-2 py-1.5 text-sm">
            <option value="">TBD</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {awayTbd && (
            <input
              {...register('awayTeamLabel')}
              type="text"
              placeholder="Label (e.g. Pool B Winner)"
              className="w-full border rounded px-2 py-1.5 text-sm mt-1 text-gray-500"
            />
          )}
          {errors.awayTeamId && (
            <p className="text-red-500 text-xs mt-0.5">{errors.awayTeamId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{venueLabel(sport)}</label>
            <input
              {...register('court')}
              type="text"
              placeholder="e.g. A"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Week #</label>
            <input
              {...register('weekNumber', { valueAsNumber: true })}
              type="number"
              min={1}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Adding…' : 'Add Game'}
        </button>
      </form>
    </div>
  )
}
