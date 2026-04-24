'use client'

import { useState } from 'react'
import { updateLeague } from '@/actions/leagues'

interface League {
  id: string
  name: string
  slug: string
  description: string | null
  sport: string | null
  league_type: string
  price_cents: number
  currency: string
  payment_mode: string
  min_team_size: number | null
  max_team_size: number | null
  max_teams: number | null
  season_start_date: string | null
  season_end_date: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  waiver_version_id: string | null
}

interface Waiver {
  id: string
  title: string
  version: number
}

interface Props {
  league: League
  waivers: Waiver[]
}

const SPORTS = [
  'beach_volleyball', 'volleyball', 'basketball', 'soccer', 'softball',
  'flag_football', 'kickball', 'dodgeball', 'ultimate_frisbee', 'tennis',
  'pickleball', 'other',
]

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

function toDateTimeInput(iso: string | null) {
  return iso ? iso.slice(0, 16) : ''
}

export function EditLeagueForm({ league, waivers }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const fd = new FormData(e.currentTarget)
    const waiverVal = fd.get('waiver_version_id') as string

    const result = await updateLeague(league.id, {
      name: fd.get('name') as string,
      description: (fd.get('description') as string) || undefined,
      sport: fd.get('sport') as string,
      league_type: fd.get('league_type') as 'team' | 'individual' | 'dropin' | 'tournament',
      price_cents: Number(fd.get('price_cents')),
      payment_mode: fd.get('payment_mode') as 'per_player' | 'per_team',
      min_team_size: Number(fd.get('min_team_size')),
      max_team_size: Number(fd.get('max_team_size')),
      max_teams: fd.get('max_teams') ? Number(fd.get('max_teams')) : undefined,
      season_start_date: (fd.get('season_start_date') as string) || undefined,
      season_end_date: (fd.get('season_end_date') as string) || undefined,
      registration_opens_at: (fd.get('registration_opens_at') as string) || undefined,
      registration_closes_at: (fd.get('registration_closes_at') as string) || undefined,
      waiver_version_id: waiverVal || null,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setOpen(false)
    }
  }

  if (!open) {
    const activeWaiver = waivers.find((w) => w.id === league.waiver_version_id)
    return (
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">League Details</h2>
          {activeWaiver && (
            <p className="text-xs text-gray-400 mt-0.5">Waiver: {activeWaiver.title}</p>
          )}
        </div>
        <button
          onClick={() => { setOpen(true); setSuccess(false) }}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Edit League Details</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input name="name" defaultValue={league.name} required className="input" />
        </Field>

        <Field label="Description">
          <textarea name="description" defaultValue={league.description ?? ''} rows={3} className="input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sport">
            <select name="sport" defaultValue={league.sport ?? 'beach_volleyball'} className="input">
              {SPORTS.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select name="league_type" defaultValue={league.league_type} className="input">
              <option value="team">Team</option>
              <option value="individual">Individual</option>
              <option value="dropin">Drop-in</option>
              <option value="tournament">Tournament</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (cents)">
            <input name="price_cents" type="number" min="0" defaultValue={league.price_cents} className="input" />
          </Field>
          <Field label="Payment Mode">
            <select name="payment_mode" defaultValue={league.payment_mode} className="input">
              <option value="per_player">Per Player</option>
              <option value="per_team">Per Team</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Min Team Size">
            <input name="min_team_size" type="number" min="1" defaultValue={league.min_team_size ?? 1} className="input" />
          </Field>
          <Field label="Max Team Size">
            <input name="max_team_size" type="number" min="1" defaultValue={league.max_team_size ?? 8} className="input" />
          </Field>
          <Field label="Max Teams">
            <input name="max_teams" type="number" min="1" defaultValue={league.max_teams ?? ''} placeholder="Unlimited" className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Season Start">
            <input name="season_start_date" type="date" defaultValue={toDateInput(league.season_start_date)} className="input" />
          </Field>
          <Field label="Season End">
            <input name="season_end_date" type="date" defaultValue={toDateInput(league.season_end_date)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reg Opens">
            <input name="registration_opens_at" type="datetime-local" defaultValue={toDateTimeInput(league.registration_opens_at)} className="input" />
          </Field>
          <Field label="Reg Closes">
            <input name="registration_closes_at" type="datetime-local" defaultValue={toDateTimeInput(league.registration_closes_at)} className="input" />
          </Field>
        </div>

        <Field label="Waiver">
          <select name="waiver_version_id" defaultValue={league.waiver_version_id ?? ''} className="input">
            <option value="">No waiver required</option>
            {waivers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} (v{w.version})
              </option>
            ))}
          </select>
          {waivers.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No waivers set up.{' '}
              <a href="/admin/settings/waivers" className="underline">Create one in Settings → Waivers</a>.
            </p>
          )}
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
