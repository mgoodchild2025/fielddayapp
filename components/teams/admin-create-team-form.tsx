'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { adminCreateTeam } from '@/actions/teams'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  color: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const PRESET_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280']

interface RegisteredPlayer {
  userId: string
  name: string
  email: string
}

interface Props {
  leagueId: string
  registeredPlayers?: RegisteredPlayer[]
  /** Unmatched slot labels from template schedule (e.g. ["Team 1", "Team 2"]) */
  slotLabels?: string[]
}

export function AdminCreateTeamForm({ leagueId, registeredPlayers = [], slotLabels = [] }: Props) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string>('')
  const [captainUserId, setCaptainUserId] = useState<string>('')
  const [slotLabel, setSlotLabel] = useState<string>('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    setSuccess(false)
    const result = await adminCreateTeam({
      leagueId,
      ...data,
      color: selectedColor || undefined,
      captainUserId: captainUserId || undefined,
      slotLabel: slotLabel || undefined,
    })
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      reset()
      setSelectedColor('')
      setCaptainUserId('')
      setSlotLabel('')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-lg border p-5">
      <h3 className="font-semibold text-sm mb-4">Add Team</h3>

      {success && <p className="text-green-600 text-xs mb-3">Team created.</p>}
      {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
          <input
            {...register('name')}
            type="text"
            placeholder="e.g. The Spikers"
            className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Colour</label>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(selectedColor === color ? '' : color)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {slotLabels.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Map to schedule slot <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={slotLabel}
              onChange={(e) => setSlotLabel(e.target.value)}
              className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
            >
              <option value="">— Don&apos;t map yet —</option>
              {slotLabels.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              All games scheduled for this slot will be reassigned to the new team.
            </p>
          </div>
        )}

        {registeredPlayers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Captain <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={captainUserId}
              onChange={(e) => setCaptainUserId(e.target.value)}
              className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
            >
              <option value="">Assign later</option>
              {registeredPlayers.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}{p.email ? ` · ${p.email}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Creating…' : 'Create Team'}
        </button>
      </form>
    </div>
  )
}
