'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitScore, confirmScore } from '@/actions/scores'

const schema = z.object({
  homeScore: z.coerce.number().min(0),
  awayScore: z.coerce.number().min(0),
})

type FormData = z.infer<typeof schema>

interface Props {
  gameId: string
  homeTeamName: string
  awayTeamName: string
  existingResult?: { homeScore: number; awayScore: number; status: string } | null
  canConfirm?: boolean
}

export function ScoreSubmitForm({ gameId, homeTeamName, awayTeamName, existingResult, canConfirm }: Props) {
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      homeScore: existingResult?.homeScore ?? 0,
      awayScore: existingResult?.awayScore ?? 0,
    },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    const result = await submitScore({ gameId, homeScore: data.homeScore, awayScore: data.awayScore })
    if (result.error) setError(result.error)
    else setSubmitted(true)
    setLoading(false)
  }

  async function handleConfirm() {
    setConfirming(true)
    const result = await confirmScore(gameId)
    if (result.error) setError(result.error)
    setConfirming(false)
  }

  if (existingResult?.status === 'confirmed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
        <p className="font-semibold text-green-700">Result confirmed ✓</p>
        <p className="text-lg font-bold mt-1">{existingResult.homeScore} – {existingResult.awayScore}</p>
        <p className="text-xs text-gray-500 mt-0.5">{homeTeamName} vs {awayTeamName}</p>
      </div>
    )
  }

  if (submitted || existingResult?.status === 'pending') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <p className="font-medium text-yellow-800">Score submitted — awaiting confirmation</p>
        <p className="text-lg font-bold mt-1">{existingResult?.homeScore ?? '?'} – {existingResult?.awayScore ?? '?'}</p>
        {canConfirm && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="mt-3 px-4 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {confirming ? 'Confirming…' : 'Confirm Score'}
          </button>
        )}
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">{homeTeamName}</label>
          <input {...register('homeScore')} type="number" min={0} className="w-full border rounded-md px-3 py-2 text-center text-lg font-bold" />
          {errors.homeScore && <p className="text-red-500 text-xs">{errors.homeScore.message}</p>}
        </div>
        <span className="text-2xl font-bold text-gray-300 mt-4">–</span>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">{awayTeamName}</label>
          <input {...register('awayScore')} type="number" min={0} className="w-full border rounded-md px-3 py-2 text-center text-lg font-bold" />
          {errors.awayScore && <p className="text-red-500 text-xs">{errors.awayScore.message}</p>}
        </div>
      </div>
      <button type="submit" disabled={loading} className="w-full py-2 rounded-md font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
        {loading ? 'Submitting…' : 'Submit Score'}
      </button>
    </form>
  )
}
