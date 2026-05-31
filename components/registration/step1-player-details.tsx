'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createRegistration } from '@/actions/registrations'
import { updateProfile } from '@/actions/auth'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'
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
  positions?: string[]
  registrationType?: 'season' | 'drop_in'
  /** Session ID selected during drop-in registration flow */
  sessionId?: string | null
  /** Show the team-code field (hidden for per-team events where joining happens in a dedicated step) */
  showTeamCode?: boolean
  /** Pre-filled team code from the invite link — auto-validates on mount */
  initialTeamCode?: string | null
  /** registrationId is always provided; joinedTeamId is set when the player joined a team via code */
  onComplete: (registrationId: string, joinedTeamId?: string) => void
}

export function Step1PlayerDetails({ org, profile, playerDetails, league, userId, positions = [], registrationType = 'season', sessionId = null, showTeamCode = true, initialTeamCode = null, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState('')
  const [teamCode, setTeamCode] = useState(initialTeamCode ?? '')
  const [teamCodeError, setTeamCodeError] = useState<string | null>(null)
  const [teamCodeValid, setTeamCodeValid] = useState<{ id: string; name: string } | null>(null)
  const [validating, setValidating] = useState(false)

  // Auto-validate a pre-filled team code from the invite link
  useEffect(() => {
    const code = (initialTeamCode ?? '').trim().toUpperCase()
    if (!code || !showTeamCode) return
    setValidating(true)
    validateTeamCode(code).then((result) => {
      setValidating(false)
      if (result.error) {
        setTeamCodeError(result.error)
      } else {
        setTeamCodeValid(result.data)
      }
    })
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Consent (PIPEDA privacy + CASL marketing) ──
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [marketingEmail, setMarketingEmail] = useState(false)
  const [marketingSms, setMarketingSms] = useState(false)

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

  async function handleTeamCodeBlur() {
    const code = teamCode.trim().toUpperCase()
    if (!code) { setTeamCodeValid(null); setTeamCodeError(null); return }
    setValidating(true)
    setTeamCodeError(null)
    const result = await validateTeamCode(code)
    setValidating(false)
    if (result.error) {
      setTeamCodeValid(null)
      setTeamCodeError(result.error)
    } else {
      setTeamCodeValid(result.data)
    }
  }

  async function onSubmit(data: FormData) {
    // Block submit if a code was typed but didn't validate
    if (teamCode.trim() && !teamCodeValid) {
      setTeamCodeError('Please enter a valid team code or leave it blank.')
      return
    }

    if (!privacyAccepted) {
      setError('Please agree to the Privacy Policy to continue.')
      return
    }

    setLoading(true)
    setError(null)

    await updateProfile({ ...data, orgId: org.id })

    const result = await createRegistration({
      leagueId: league.id,
      position: selectedPosition || undefined,
      registration_type: registrationType,
      session_id: sessionId ?? undefined,
      consent: {
        privacyAccepted,
        marketingEmail,
        marketingSms,
      },
    })
    if (result.error) {
      setError(result.error === 'EVENT_FULL'
        ? 'Sorry, this event is full — no more spots are available.'
        : result.error)
      setLoading(false)
      return
    }

    // If a valid team code was provided, join the team now
    let joinedTeamId: string | undefined
    if (teamCodeValid) {
      await joinTeamByCode(teamCode.trim().toUpperCase())
      joinedTeamId = teamCodeValid.id
    }

    onComplete(result.data!.registrationId, joinedTeamId)
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
              <input {...register(name)} type={type} className="w-full border rounded-md px-3 py-2 text-base" />
              {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Level *</label>
            <select {...register('skill_level')} className="w-full border rounded-md px-3 py-2 text-base">
              <option value="">Select…</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="competitive">Competitive</option>
            </select>
            {errors.skill_level && <p className="text-red-500 text-xs mt-1">{errors.skill_level.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">T-Shirt Size *</label>
            <select {...register('t_shirt_size')} className="w-full border rounded-md px-3 py-2 text-base">
              <option value="">Select…</option>
              {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {errors.t_shirt_size && <p className="text-red-500 text-xs mt-1">{errors.t_shirt_size.message}</p>}
          </div>
        </div>

        {positions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Position</label>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-base"
            >
              <option value="">No preference</option>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
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
              <input {...register(name)} type={type} className="w-full border rounded-md px-3 py-2 text-base" />
              {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>}
            </div>
          ))}
        </div>
      </div>

      {showTeamCode && (
        <div className="bg-white rounded-lg border p-5 space-y-2">
          <h2 className="font-semibold">Have a Team Code? <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>
          <p className="text-xs text-gray-500">If your captain gave you a 6-character code, enter it here to join your team automatically.</p>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                type="text"
                value={teamCode}
                onChange={(e) => {
                  setTeamCode(e.target.value.toUpperCase())
                  setTeamCodeValid(null)
                  setTeamCodeError(null)
                }}
                onBlur={handleTeamCodeBlur}
                placeholder="e.g. AB3X7K"
                maxLength={6}
                className="w-full border rounded-md px-3 py-2 text-sm font-mono tracking-widest uppercase"
              />
              {teamCodeError && <p className="text-red-500 text-xs mt-1">{teamCodeError}</p>}
              {teamCodeValid && (
                <p className="text-green-600 text-xs mt-1">✓ Joining <strong>{teamCodeValid.name}</strong></p>
              )}
            </div>
            {validating && <span className="text-xs text-gray-400 mt-2.5">Checking…</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-3">Notifications</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="sms_opted_in"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">
            Send me SMS game reminders to my phone number above.
            <span className="block text-xs text-gray-400 mt-0.5">Reply STOP at any time to unsubscribe.</span>
          </span>
        </label>
      </div>

      {/* ── Review and consent ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Review &amp; Consent</h2>

        {/* Required consent — privacy policy */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600">To continue, please review and agree to the following.</p>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              I have read and agree to the{' '}
              <a href="https://fielddayapp.ca/privacy" target="_blank" rel="noopener noreferrer"
                className="underline text-blue-600 hover:text-blue-800">Fieldday Privacy Policy</a>.
              <span className="block text-xs text-gray-400 mt-0.5">
                You&apos;ll review and sign the league waiver on the next step.
              </span>
            </span>
          </label>
        </div>

        {/* Optional marketing — unbundled, unticked (CASL) */}
        <div className="pt-3 border-t space-y-2">
          <p className="text-xs text-gray-500">
            Optional. You can change these any time in your account settings. Game reminders and
            confirmations are sent regardless and aren&apos;t affected by these choices.
          </p>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marketingEmail}
              onChange={(e) => setMarketingEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Send me promotional emails about leagues, events, and news.</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marketingSms}
              onChange={(e) => setMarketingSms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Send me promotional SMS messages.
              <span className="block text-xs text-gray-400 mt-0.5">Standard message rates may apply. Reply STOP to unsubscribe.</span>
            </span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !privacyAccepted}
        className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {loading ? 'Saving…' : 'Continue to Waiver →'}
      </button>
    </form>
  )
}
