'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitScore } from '@/actions/scores'

const schema = z.object({
  homeScore: z.number().min(0, 'Required'),
  awayScore: z.number().min(0, 'Required'),
})

type FormData = z.infer<typeof schema>

interface Props {
  gameId: string
  homeTeamName: string
  awayTeamName: string
  onSuccess?: () => void
}

export function ScoreSubmissionForm({ gameId, homeTeamName, awayTeamName, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { homeScore: 0, awayScore: 0 },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    const result = await submitScore({
      gameId,
      homeScore: data.homeScore,
      awayScore: data.awayScore,
    })
    if (result.error) {
      setError(result.error)
    } else {
      setSubmitted(true)
      onSuccess?.()
    }
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="text-center py-4 text-green-600 text-sm font-medium">
        Score submitted — pending confirmation.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 truncate">{homeTeamName}</label>
          <input
            {...register('homeScore', { valueAsNumber: true })}
            type="number"
            min={0}
            className="w-full border rounded-md px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2"
          />
          {errors.homeScore && <p className="text-red-500 text-xs mt-1">{errors.homeScore.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 truncate">{awayTeamName}</label>
          <input
            {...register('awayScore', { valueAsNumber: true })}
            type="number"
            min={0}
            className="w-full border rounded-md px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2"
          />
          {errors.awayScore && <p className="text-red-500 text-xs mt-1">{errors.awayScore.message}</p>}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Submitting…' : 'Submit Score'}
      </button>
    </form>
  )
}
