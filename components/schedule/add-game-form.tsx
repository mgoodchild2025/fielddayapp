'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addGame } from '@/actions/schedule'

const schema = z.object({
  homeTeamId: z.string().uuid().optional(),
  awayTeamId: z.string().uuid().optional(),
  scheduledAt: z.string().min(1, 'Date and time required'),
  court: z.string().optional(),
  weekNumber: z.number().optional(),
}).refine(
  (d) => !d.homeTeamId || !d.awayTeamId || d.homeTeamId !== d.awayTeamId,
  { message: 'Home and away teams must be different', path: ['awayTeamId'] }
)

type FormData = z.infer<typeof schema>

interface Props {
  leagueId: string
  teams: { id: string; name: string }[]
}

export function AddGameForm({ leagueId, teams }: Props) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setSuccess(false)
    setServerError(null)
    // Convert datetime-local string (treated as local time by the browser) to UTC ISO
    const scheduledAtUtc = data.scheduledAt
      ? new Date(data.scheduledAt).toISOString()
      : data.scheduledAt
    const result = await addGame({ leagueId, ...data, scheduledAt: scheduledAtUtc })
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
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Away Team</label>
          <select {...register('awayTeamId')} className="w-full border rounded px-2 py-1.5 text-sm">
            <option value="">TBD</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {errors.awayTeamId && (
            <p className="text-red-500 text-xs mt-0.5">{errors.awayTeamId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Court</label>
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
