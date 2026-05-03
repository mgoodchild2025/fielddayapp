'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Step0RoleSelect } from './step0-role-select'
import { Step1PlayerDetails } from './step1-player-details'
import { Step2Waiver } from './step2-waiver'
import { Step3Payment } from './step3-payment'
import { StepCaptainTeam } from './step-captain-team'
import { StepTeamJoin } from './step-team-join'
import type { TeamOption } from './step-team-join'
import { linkWaiverToRegistration, activateRegistration } from '@/actions/registrations'
import type { Database } from '@/types/database'

type League = Database['public']['Tables']['leagues']['Row']
type Waiver = Database['public']['Tables']['waivers']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type PlayerDetails = Database['public']['Tables']['player_details']['Row']

interface Props {
  org: { id: string; name: string; slug: string }
  league: League
  waiver: Waiver | null
  profile: Profile | null
  playerDetails: PlayerDetails | null
  userId: string
  initialStep?: number
  initialRegistrationId?: string | null
  hasOnlinePayments?: boolean
  positions?: string[]
  isDropIn?: boolean
  dropInPriceCents?: number | null
  captainTeamId?: string | null
  captainTeamName?: string | null
  /** Set when user is already on a team as a non-captain (e.g. accepted a team invite) */
  playerTeamId?: string | null
  playerTeamName?: string | null
  /** True when max_teams is reached — captain path is disabled, player path remains open */
  teamsAtCapacity?: boolean
  leagueTeams?: TeamOption[]
}

// Steps used in the progress bar (step 0 = role select, shown separately; never in bar)
const PLAYER_STEPS = ['Player Details', 'Waiver', 'Join a Team']
const CAPTAIN_STEPS = ['Player Details', 'Waiver', 'Create Team']
const PAYMENT_STEPS = ['Player Details', 'Waiver', 'Payment']

export function RegistrationFlow({
  org,
  league,
  waiver,
  profile,
  playerDetails,
  userId,
  initialStep = 1,
  initialRegistrationId = null,
  hasOnlinePayments = false,
  positions = [],
  isDropIn = false,
  dropInPriceCents = null,
  captainTeamId = null,
  captainTeamName = null,
  playerTeamId = null,
  playerTeamName = null,
  teamsAtCapacity = false,
  leagueTeams = [],
}: Props) {
  const router = useRouter()

  const effectivePriceCents = isDropIn ? (dropInPriceCents ?? 0) : league.price_cents
  const isPerTeam = (league as unknown as { payment_mode?: string }).payment_mode === 'per_team'
  const showPaymentStep = effectivePriceCents > 0 && hasOnlinePayments && !isPerTeam

  // For per-team events, we show a role-select screen before step 1.
  // Skip it if: resuming (initialStep > 1), user is already on a team, or teams are full (force player).
  const inferredRole: 'captain' | 'player' | null =
    isPerTeam && (initialStep > 1 || captainTeamId || playerTeamId || teamsAtCapacity)
      ? captainTeamId ? 'captain' : 'player'
      : null

  const [role, setRole] = useState<'captain' | 'player' | null>(inferredRole)
  const [showRoleSelect, setShowRoleSelect] = useState(
    isPerTeam && initialStep === 1 && !captainTeamId && !playerTeamId && !teamsAtCapacity
  )
  const [step, setStep] = useState(initialStep)
  const [registrationId, setRegistrationId] = useState<string | null>(initialRegistrationId)
  const [completing, setCompleting] = useState(false)
  // Track the captain's newly-created team so we can redirect after waiver
  const [newCaptainTeamId, setNewCaptainTeamId] = useState<string | null>(captainTeamId)
  const [newCaptainTeamName, setNewCaptainTeamName] = useState<string | null>(captainTeamName)

  const isCaptain = role === 'captain'
  const isPlayer = role === 'player'

  // Choose the right step labels for the progress bar
  const steps = showPaymentStep
    ? PAYMENT_STEPS
    : isPerTeam && isCaptain
      ? CAPTAIN_STEPS
      : isPerTeam && isPlayer
        ? PLAYER_STEPS
        : PAYMENT_STEPS.filter((s) => s !== 'Payment')

  function advanceStep(n: number) {
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function completeRegistration(regId: string | null) {
    setCompleting(true)
    if (regId) await activateRegistration(regId)
    router.push(`/register/${league.slug}/success`)
  }

  async function afterWaiver() {
    if (showPaymentStep) {
      advanceStep(3)
    } else if (isPerTeam) {
      if (isPlayer && playerTeamId) {
        // Player already on a team via invite — activate and skip team-join
        await activateRegistration(registrationId!)
        router.push(`/register/${league.slug}/success`)
      } else if (isCaptain) {
        // Captain: activate now (team fee already paid), then show team management
        await activateRegistration(registrationId!)
        advanceStep(3)
      } else {
        // Player not yet on a team: go to team-join step first.
        // Registration is activated inside StepTeamJoin's onComplete, after they join.
        advanceStep(3)
      }
    } else {
      await completeRegistration(registrationId)
    }
  }

  // ── Role select screen (step 0 for per-team events) ───────────────────────
  if (showRoleSelect) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="max-w-xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            Register — {league.name}
          </h1>
          <Step0RoleSelect
            leagueName={league.name}
            priceCents={effectivePriceCents}
            teamsAtCapacity={teamsAtCapacity}
            onSelect={(r) => {
              setRole(r)
              setShowRoleSelect(false)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {isPerTeam && (
              <button
                type="button"
                onClick={() => { setShowRoleSelect(true); setStep(1) }}
                className="text-xs text-gray-400 hover:text-gray-600"
                style={{ lineHeight: 1 }}
              >
                ←
              </button>
            )}
            <h1 className="text-2xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {isDropIn ? 'Drop-in — ' : 'Register — '}{league.name}
            </h1>
          </div>
          {/* Role badge */}
          {isPerTeam && role && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {isCaptain ? '🏆 Registering as captain' : '🙋 Registering as player'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {steps.map((label, i) => {
              const internalStep = i + 1
              const isActive = internalStep === step
              const isDone = internalStep < step
              return (
                <div key={label} className="flex items-center gap-1 flex-1">
                  <div
                    className={`flex-1 h-1.5 rounded-full ${isDone || isActive ? '' : 'bg-gray-200'}`}
                    style={{ backgroundColor: isDone || isActive ? 'var(--brand-primary)' : undefined }}
                  />
                  {i < steps.length - 1 && (
                    <div
                      className={`h-1.5 w-6 rounded-full ${isDone ? '' : 'bg-gray-200'}`}
                      style={{ backgroundColor: isDone ? 'var(--brand-primary)' : undefined }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((label, i) => {
              const internalStep = i + 1
              return (
                <p
                  key={label}
                  className="text-xs text-gray-500"
                  style={{ color: internalStep <= step ? 'var(--brand-primary)' : undefined }}
                >
                  {label}
                </p>
              )
            })}
          </div>
        </div>

        {/* Step 1 — Player details */}
        {step === 1 && (
          <Step1PlayerDetails
            org={org}
            profile={profile}
            playerDetails={playerDetails}
            league={league}
            userId={userId}
            positions={positions}
            registrationType={isDropIn ? 'drop_in' : 'season'}
            showTeamCode={!isPerTeam}
            onComplete={(regId) => { setRegistrationId(regId); advanceStep(2) }}
          />
        )}

        {/* Step 2 — Waiver */}
        {step === 2 && (
          <Step2Waiver
            org={org}
            waiver={waiver}
            userId={userId}
            leagueId={league.id}
            playerName={profile?.full_name ?? ''}
            playerDob={playerDetails?.date_of_birth ?? null}
            onComplete={async (sigId) => {
              if (registrationId) {
                await linkWaiverToRegistration(registrationId, sigId)
              }
              afterWaiver()
            }}
            onSkip={afterWaiver}
            onBack={() => advanceStep(1)}
          />
        )}

        {completing && (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            Completing registration…
          </div>
        )}

        {/* Step 3 — Per-player payment */}
        {step === 3 && showPaymentStep && !completing && (
          <Step3Payment
            org={org}
            league={league}
            userId={userId}
            registrationId={registrationId!}
            priceCents={effectivePriceCents}
            onBack={() => advanceStep(waiver ? 2 : 1)}
          />
        )}

        {/* Step 3 — Captain: create/name team */}
        {step === 3 && isPerTeam && isCaptain && !completing && (
          <StepCaptainTeam
            leagueId={league.id}
            captainTeamId={newCaptainTeamId}
            captainTeamName={newCaptainTeamName}
            onBack={() => advanceStep(2)}
          />
        )}

        {/* Step 3 — Player already on a team (accepted an invite before registering) */}
        {step === 3 && isPerTeam && isPlayer && playerTeamId && !completing && (
          <div className="bg-white rounded-lg border p-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto text-2xl">✅</div>
            <div>
              <h2 className="font-semibold text-lg">You&apos;re on the team!</h2>
              <p className="text-sm text-gray-500 mt-1">
                You&apos;re already on <strong>{playerTeamName}</strong>. Your registration is complete.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/register/${league.slug}/success`)}
              className="block w-full py-3 rounded-md font-semibold text-white text-center"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Finish →
            </button>
          </div>
        )}

        {/* Step 3 — Player: team code or browse */}
        {step === 3 && isPerTeam && isPlayer && !playerTeamId && !completing && (
          <StepTeamJoin
            teams={leagueTeams}
            onComplete={async () => {
              // Activate registration now that the player has joined (or skipped) team selection
              if (registrationId) await activateRegistration(registrationId)
              router.push(`/register/${league.slug}/success`)
            }}
            onBack={() => advanceStep(2)}
          />
        )}
      </div>
    </div>
  )
}
