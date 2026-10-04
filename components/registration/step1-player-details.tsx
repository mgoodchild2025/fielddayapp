'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createRegistration } from '@/actions/registrations'
import { updateProfile } from '@/actions/auth'
import { validateTeamCode, joinTeamByCode } from '@/actions/teams'
import type { Database } from '@/types/database'
import { toast } from 'sonner'

type TeamCodeResult = { id: string; name: string } | null

type Profile = Database['public']['Tables']['profiles']['Row']
type PlayerDetails = Database['public']['Tables']['player_details']['Row']
type League = Database['public']['Tables']['leagues']['Row']

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

const schema = z.object({
  full_name: z.string().min(2, 'Full name required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(10, 'Phone number required'),
  skill_level: z.enum(['beginner', 'intermediate', 'competitive']),
  // Optional everywhere — an unanswered select submits '', normalized away.
  t_shirt_size: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SHIRT_SIZES).optional()),
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
  /** Reuse a prior current-year waiver signature (drop-in) — linked at creation */
  waiverSignatureId?: string | null
  /** Player already agreed to the current Privacy Policy version — skip re-consent */
  privacyAlreadyAccepted?: boolean
  /** registrationId is always provided; joinedTeamId is set when the player joined a team via code */
  /** The step after this one ("Waiver", "Payment"…), or null when submitting completes registration. */
  nextStepLabel?: string | null
  onComplete: (registrationId: string, joinedTeamId?: string) => void
}

export function Step1PlayerDetails({ org, profile, playerDetails, league, userId, positions = [], registrationType = 'season', sessionId = null, showTeamCode = true, initialTeamCode = null, waiverSignatureId = null, privacyAlreadyAccepted = false, nextStepLabel = 'Waiver', onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privacyError, setPrivacyError] = useState(false)
  // Server errors render at the top of a long form — bring them into view
  // (on a phone the button is far below, so the tap otherwise looked dead).
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!error) return
    errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    errorRef.current?.focus({ preventScroll: true })
  }, [error])
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
  const [privacyAccepted, setPrivacyAccepted] = useState(privacyAlreadyAccepted)
  const [marketingEmail, setMarketingEmail] = useState(false)
  const [marketingSms, setMarketingSms] = useState(false)
  // Transactional SMS — on by default (opt-out). Persisted to the profile below.
  const [smsOptedIn, setSmsOptedIn] = useState(true)

  const isDropIn = registrationType === 'drop_in'

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    // Check each field when the player leaves it (then live while they fix it),
    // not only on submit. On submit, the first invalid field gets focus.
    mode: 'onTouched',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
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

  // Check a code as soon as it's complete (6 characters) and again on blur.
  // On a phone, typing the code then tapping Continue fired blur + submit
  // together: submit saw "not validated yet" and showed an error under a code
  // that then turned ✓. Submit now awaits the check instead (below).
  async function checkTeamCode(raw: string): Promise<TeamCodeResult> {
    const code = raw.trim().toUpperCase()
    if (!code) { setTeamCodeValid(null); setTeamCodeError(null); return null }
    setValidating(true)
    setTeamCodeError(null)
    const result = await validateTeamCode(code)
    setValidating(false)
    if (result.error || !result.data) {
      setTeamCodeValid(null)
      setTeamCodeError(result.error ?? 'Team code not found')
      return null
    }
    setTeamCodeValid(result.data)
    return result.data
  }

  async function onSubmit(data: FormData) {
    // A typed code must check out — wait for the check rather than racing it.
    let team = teamCodeValid
    if (teamCode.trim() && !team) {
      team = await checkTeamCode(teamCode)
      if (!team) {
        setTeamCodeError((e) => e ?? 'Please enter a valid team code or leave it blank.')
        document.getElementById('team_code')?.focus()
        return
      }
    }

    if (!privacyAccepted) {
      // Said beside the checkbox, not in a banner at the top.
      setPrivacyError(true)
      document.getElementById('privacy-consent')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setLoading(true)
    setError(null)
    // try/finally: a dropped connection left the button stuck on "Saving…".
    try {
    const profileResult = await updateProfile({ ...data, sms_opted_in: smsOptedIn, orgId: org.id })
    if (profileResult?.error) {
      setError(profileResult.error)
      return
    }

    const result = await createRegistration({
      leagueId: league.id,
      position: selectedPosition || undefined,
      registration_type: registrationType,
      session_id: sessionId ?? undefined,
      waiverSignatureId: waiverSignatureId ?? undefined,
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
      return
    }

    // If a valid team code was provided, join the team now — and only send
    // the player to that team if the join actually worked.
    let joinedTeamId: string | undefined
    if (team) {
      const joined = await joinTeamByCode(teamCode.trim().toUpperCase())
      if (joined?.error) {
        toast.error(`You're registered, but joining ${team.name} didn't work: ${joined.error}. Ask your captain for a new code.`)
      } else {
        joinedTeamId = team.id
      }
    }

    onComplete(result.data!.registrationId, joinedTeamId)
    } catch {
      setError("Couldn't reach the server — check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm outline-none">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Your Info</h2>
        {/* One column on phones: side by side, an email address got ~145px. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Full Name', name: 'full_name' as keyof FormData, type: 'text', autoComplete: 'name' },
            { label: 'Email', name: 'email' as keyof FormData, type: 'email', autoComplete: 'email' },
            { label: 'Phone', name: 'phone' as keyof FormData, type: 'tel', autoComplete: 'tel' },
          ].map(({ label, name, type, autoComplete }) => (
            <div key={name} className={name === 'full_name' ? 'sm:col-span-2' : ''}>
              <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                {...register(name)}
                id={name}
                type={type}
                autoComplete={autoComplete}
                aria-invalid={errors[name] ? true : undefined}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
                className="w-full border rounded-md px-3 py-2 text-base"
              />
              {errors[name] && <p id={`${name}-error`} className="text-red-600 text-xs mt-1">{errors[name]?.message as string}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={isDropIn ? 'col-span-2' : ''}>
            <label htmlFor="skill_level" className="block text-sm font-medium text-gray-700 mb-1">Skill Level *</label>
            <select
              {...register('skill_level')}
              id="skill_level"
              aria-invalid={errors.skill_level ? true : undefined}
              aria-describedby={errors.skill_level ? 'skill_level-error' : undefined}
              className="w-full border rounded-md px-3 py-2 text-base"
            >
              <option value="">Select…</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="competitive">Competitive</option>
            </select>
            {errors.skill_level && <p id="skill_level-error" className="text-red-600 text-xs mt-1">{errors.skill_level.message}</p>}
          </div>
          {!isDropIn && (
            <div>
              <label htmlFor="t_shirt_size" className="block text-sm font-medium text-gray-700 mb-1">T-Shirt Size <span className="font-normal text-gray-400">(optional)</span></label>
              <select {...register('t_shirt_size')} id="t_shirt_size" className="w-full border rounded-md px-3 py-2 text-base">
                <option value="">Select…</option>
                {SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.t_shirt_size && <p className="text-red-600 text-xs mt-1">{errors.t_shirt_size.message}</p>}
            </div>
          )}
        </div>

        {positions.length > 0 && (
          <div>
            <label htmlFor="preferred_position" className="block text-sm font-medium text-gray-700 mb-1">Preferred Position</label>
            <select
              id="preferred_position"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            // Someone else's details — keep the browser from filling in the player's own.
            { label: 'Name', name: 'emergency_contact_name' as keyof FormData, type: 'text', autoComplete: 'off' },
            { label: 'Phone', name: 'emergency_contact_phone' as keyof FormData, type: 'tel', autoComplete: 'off' },
          ].map(({ label, name, type, autoComplete }) => (
            <div key={name}>
              <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                {...register(name)}
                id={name}
                type={type}
                autoComplete={autoComplete}
                aria-invalid={errors[name] ? true : undefined}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
                className="w-full border rounded-md px-3 py-2 text-base"
              />
              {errors[name] && <p id={`${name}-error`} className="text-red-600 text-xs mt-1">{errors[name]?.message as string}</p>}
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
              <label htmlFor="team_code" className="sr-only">Team code</label>
              <input
                id="team_code"
                type="text"
                value={teamCode}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase()
                  setTeamCode(next)
                  setTeamCodeValid(null)
                  setTeamCodeError(null)
                  if (next.trim().length === 6) checkTeamCode(next)
                }}
                onBlur={() => { if (teamCode.trim() && !teamCodeValid && !validating) checkTeamCode(teamCode) }}
                placeholder="e.g. AB3X7K"
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="done"
                aria-invalid={teamCodeError ? true : undefined}
                aria-describedby={teamCodeError ? 'team_code-error' : teamCodeValid ? 'team_code-ok' : undefined}
                className="w-full border rounded-md px-3 py-2 text-base font-mono tracking-widest uppercase"
              />
              {teamCodeError && <p id="team_code-error" className="text-red-600 text-xs mt-1">{teamCodeError}</p>}
              {teamCodeValid && (
                <p id="team_code-ok" className="text-green-700 text-xs mt-1">✓ Joining <strong>{teamCodeValid.name}</strong></p>
              )}
            </div>
            {validating && <span className="text-xs text-gray-500 mt-2.5">Checking…</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-3">Notifications</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={smsOptedIn}
            onChange={(e) => setSmsOptedIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">
            Send me game &amp; schedule text alerts to the phone number above.
            <span className="block text-xs text-gray-500 mt-0.5">Reminders, RSVPs, and schedule changes. Standard message rates may apply. Reply STOP at any time to unsubscribe.</span>
          </span>
        </label>
      </div>

      {/* ── Review and consent ── */}
      <div className="bg-white rounded-lg border p-5 space-y-4">
        <h2 className="font-semibold">Review &amp; Consent</h2>

        {/* Required consent — privacy policy. Skipped if the player already agreed
            to the current version (they only re-consent when the policy changes). */}
        {privacyAlreadyAccepted ? (
          <p className="text-sm text-gray-600">
            ✓ You&apos;ve already agreed to the current{' '}
            <a href="https://fielddayapp.ca/privacy" target="_blank" rel="noopener noreferrer"
              className="underline text-blue-600 hover:text-blue-800">Fieldday Privacy Policy</a>.
            {nextStepLabel === 'Waiver' && (
              <span className="block text-xs text-gray-500 mt-0.5">
                You&apos;ll review and sign the league waiver on the next step.
              </span>
            )}
          </p>
        ) : (
          <div id="privacy-consent" className="space-y-2">
            <p className="text-sm text-gray-600">To continue, please review and agree to the following.</p>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => { setPrivacyAccepted(e.target.checked); if (e.target.checked) setPrivacyError(false) }}
                aria-invalid={privacyError || undefined}
                aria-describedby={privacyError ? 'privacy-error' : undefined}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the{' '}
                <a href="https://fielddayapp.ca/privacy" target="_blank" rel="noopener noreferrer"
                  className="underline text-blue-600 hover:text-blue-800">Fieldday Privacy Policy</a>.
                {nextStepLabel === 'Waiver' && (
                  <span className="block text-xs text-gray-500 mt-0.5">
                    You&apos;ll review and sign the league waiver on the next step.
                  </span>
                )}
              </span>
            </label>
            {privacyError && (
              <p id="privacy-error" role="alert" className="fd-fade-in text-red-600 text-xs font-medium pl-7">
                Tick this box to agree to the Privacy Policy and continue.
              </p>
            )}
          </div>
        )}

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
        disabled={loading}
        className="press w-full min-h-12 rounded-md font-semibold bg-brand-primary text-on-brand disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving…' : nextStepLabel ? `Continue to ${nextStepLabel} →` : 'Complete registration'}
      </button>
    </form>
  )
}
