'use client'

import { useTransition, useState } from 'react'
import { updatePlayerDetails, updateOrgMemberRole } from '@/actions/players'

type OrgRole = 'org_admin' | 'league_admin' | 'captain' | 'player'

interface Props {
  userId: string
  profile: { full_name: string; phone: string | null }
  playerDetails: {
    skill_level: string | null
    t_shirt_size: string | null
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
    date_of_birth: string | null
    how_did_you_hear: string | null
  } | null
  orgRole: OrgRole
}

const inputClass =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent'
const labelClass = 'block text-xs font-medium text-gray-500 mb-1'

export function PlayerDetailsForm({ userId, profile, playerDetails, orgRole }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const input = {
      full_name: fd.get('full_name') as string,
      phone: fd.get('phone') as string,
      skill_level: (fd.get('skill_level') as string) || null,
      t_shirt_size: (fd.get('t_shirt_size') as string) || null,
      emergency_contact_name: (fd.get('emergency_contact_name') as string) || null,
      emergency_contact_phone: (fd.get('emergency_contact_phone') as string) || null,
      date_of_birth: (fd.get('date_of_birth') as string) || null,
      how_did_you_hear: (fd.get('how_did_you_hear') as string) || null,
    }
    const newRole = fd.get('org_role') as OrgRole

    setError(null)
    setSaved(false)

    startTransition(async () => {
      const [detRes, roleRes] = await Promise.all([
        updatePlayerDetails(userId, input as Parameters<typeof updatePlayerDetails>[1]),
        newRole !== orgRole ? updateOrgMemberRole(userId, newRole) : Promise.resolve({ error: null }),
      ])
      if (detRes.error || roleRes.error) {
        setError(detRes.error ?? roleRes.error ?? 'Unknown error')
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Full Name</label>
          <input name="full_name" defaultValue={profile.full_name} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input name="phone" defaultValue={profile.phone ?? ''} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Date of Birth</label>
          <input
            name="date_of_birth"
            type="date"
            defaultValue={playerDetails?.date_of_birth ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Skill Level</label>
          <select name="skill_level" defaultValue={playerDetails?.skill_level ?? ''} className={inputClass}>
            <option value="">Not set</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="competitive">Competitive</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>T-Shirt Size</label>
          <select name="t_shirt_size" defaultValue={playerDetails?.t_shirt_size ?? ''} className={inputClass}>
            <option value="">Not set</option>
            {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Org Role</label>
          <select name="org_role" defaultValue={orgRole} className={inputClass}>
            <option value="player">Player</option>
            <option value="captain">Captain</option>
            <option value="league_admin">League Admin</option>
            <option value="org_admin">Org Admin</option>
          </select>
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Emergency Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              name="emergency_contact_name"
              defaultValue={playerDetails?.emergency_contact_name ?? ''}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              name="emergency_contact_phone"
              defaultValue={playerDetails?.emergency_contact_phone ?? ''}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>How did they hear about us?</label>
        <input
          name="how_did_you_hear"
          defaultValue={playerDetails?.how_did_you_hear ?? ''}
          className={inputClass}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  )
}
