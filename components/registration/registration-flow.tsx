'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Step0RoleSelect } from './step0-role-select'
import { Step1PlayerDetails } from './step1-player-details'
import { Step2Waiver } from './step2-waiver'
import { Step3Payment } from './step3-payment'
import { StepAddons } from './step-addons'
import { StepCaptainTeam } from './step-captain-team'
import { StepTeamJoin } from './step-team-join'
import type { TeamOption } from './step-team-join'
import type { MerchItemForStep, MerchSelection } from './step-addons'
import { activateRegistration } from '@/actions/registrations'
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
  earlyBirdPriceCents?: number | null
  earlyBirdDeadline?: string | null
  captainTeamId?: string | null
  captainTeamName?: string | null
  /** Set when user is already on a team as a non-captain (e.g. accepted a team invite) */
  playerTeamId?: string | null
  playerTeamName?: string | null
  /** True when max_teams is reached — captain path is disabled, player path remains open */
  teamsAtCapacity?: boolean
  leagueTeams?: TeamOption[]
  /** Merchandise items available for this league. When empty, the add-ons step is skipped. */
  leagueMerch?: MerchItemForStep[]
  /** Pre-filled team code from the invite link (?code=XXXXXX) */
  initialTeamCode?: string | null
  /**
   * Manual payment instructions from org settings. When set and the event has a
   * price but no online (Stripe) payments, the registration flow shows an info
   * step with these instructions before completing the registration.
   */
  manualPaymentInstructions?: string | null
  /** Upcoming sessions for drop-in registration — player picks one before step 1 */
  dropInSessions?: { id: string; scheduled_at: string; capacity: number | null; registered_count: number }[]
  /** Session pre-selected from the event page "Register to join" button — skips the picker */
  preselectedSessionId?: string | null
}

// Steps used in the progress bar (step 0 = role select, shown separately; never in bar)
const PLAYER_STEPS = ['Player Details', 'Waiver', 'Join a Team']
const CAPTAIN_STEPS = ['Player Details', 'Waiver', 'Create Team']
const CAPTAIN_PAYMENT_STEPS = ['Player Details', 'Waiver', 'Payment']
const PAYMENT_STEPS = ['Player Details', 'Waiver', 'Payment']
const PAYMENT_STEPS_WITH_MERCH = ['Player Details', 'Waiver', 'Add-ons', 'Payment']
const MANUAL_PAYMENT_STEPS = ['Player Details', 'Waiver', 'Payment Info']

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
  earlyBirdPriceCents = null,
  earlyBirdDeadline = null,
  captainTeamId = null,
  captainTeamName = null,
  playerTeamId = null,
  playerTeamName = null,
  teamsAtCapacity = false,
  leagueTeams = [],
  leagueMerch = [],
  initialTeamCode = null,
  manualPaymentInstructions = null,
  dropInSessions = [],
  preselectedSessionId = null,
}: Props) {
  const router = useRouter()

  const earlyBirdActive = !isDropIn && earlyBirdPriceCents != null && earlyBirdDeadline != null && new Date() < new Date(earlyBirdDeadline)
  const effectivePriceCents = isDropIn ? (dropInPriceCents ?? 0) : (earlyBirdActive ? earlyBirdPriceCents! : league.price_cents)
  const isPerTeam = (league as unknown as { payment_mode?: string }).payment_mode === 'per_team'
  const showPaymentStep = effectivePriceCents > 0 && hasOnlinePayments && !isPerTeam
  // Manual payment: price is set but Stripe is not configured/enabled.
  // Show an informational step with the org's offline payment instructions.
  const showManualPaymentStep = effectivePriceCents > 0 && !hasOnlinePayments && !isPerTeam
  // Show add-ons whenever merch exists and online payments are available —
  // independent of whether the base registration fee is non-zero.
  const showAddOnsStep = leagueMerch.length > 0 && hasOnlinePayments && !isPerTeam

  // When an admin pre-assigns a captain to a team (captainTeamId is already set),
  // the team fee hasn't been paid yet. Route through an inline payment step so the
  // captain can pay — Stripe or manual payment depending on org settings.
  // Step3Payment handles both: Stripe redirects to checkout; manual returns instructions inline.
  const showCaptainPaymentStep =
    isPerTeam && captainTeamId !== null && effectivePriceCents > 0

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
  // Session picker: shown before step 1 for fresh drop-in registrations with sessions available.
  // Skipped when a session was already chosen on the event page (preselectedSessionId).
  const showSessionPicker = isDropIn && dropInSessions.length > 0 && !initialRegistrationId && !preselectedSessionId
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(preselectedSessionId ?? null)
  const [step, setStep] = useState(initialStep)
  const [registrationId, setRegistrationId] = useState<string | null>(initialRegistrationId)
  const [completing, setCompleting] = useState(false)
  // Track the captain's newly-created team so we can redirect after waiver
  const [newCaptainTeamId, setNewCaptainTeamId] = useState<string | null>(captainTeamId)
  const [newCaptainTeamName, setNewCaptainTeamName] = useState<string | null>(captainTeamName)
  // For per-player events: team ID joined via team code in Step 1
  const [step1TeamId, setStep1TeamId] = useState<string | null>(null)
  // Merchandise selections from add-ons step
  const [merchSelections, setMerchSelections] = useState<MerchSelection[]>([])

  const isCaptain = role === 'captain'
  const isPlayer = role === 'player'

  // Choose the right step labels for the progress bar
  const steps = (showPaymentStep || showAddOnsStep)
    ? (showAddOnsStep ? PAYMENT_STEPS_WITH_MERCH : PAYMENT_STEPS)
    : showManualPaymentStep
      ? MANUAL_PAYMENT_STEPS
      : showCaptainPaymentStep
        ? CAPTAIN_PAYMENT_STEPS
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
    // If the player joined a team via code in Step 1, land on that team page
    if (step1TeamId) {
      router.push(`/teams/${step1TeamId}`)
    } else {
      router.push(`/register/${league.slug}/success`)
    }
  }

  async function afterWaiver() {
    if (showAddOnsStep) {
      // go to add-ons step (step 3), then payment is step 4
      advanceStep(3)
    } else if (showPaymentStep) {
      advanceStep(3)
    } else if (showManualPaymentStep) {
      // Show the offline payment instructions before completing registration
      advanceStep(3)
    } else if (isPerTeam) {
      if (isPlayer && playerTeamId) {
        // Player already on a team via invite — activate and skip team-join
        await activateRegistration(registrationId!)
        // If they arrived via an invite link, land on their team page
        if (initialTeamCode) {
          router.push(`/teams/${playerTeamId}`)
        } else {
          router.push(`/register/${league.slug}/success`)
        }
      } else if (isCaptain) {
        if (showCaptainPaymentStep) {
          // Admin-invited captain: team exists but fee hasn't been paid yet.
          // Route through the inline payment step — Stripe webhook activates
          // the registration after payment, same as per-player flow.
          advanceStep(3)
        } else {
          // New captain creating their own team (no pre-assigned team), or free league.
          // Activate now; team page handles team creation / any team-level payment.
          await activateRegistration(registrationId!)
          advanceStep(3)
        }
      } else {
        // Player not yet on a team: go to team-join step first.
        // Registration is activated inside StepTeamJoin's onComplete, after they join.
        advanceStep(3)
      }
    } else {
      await completeRegistration(registrationId)
    }
  }

  // ── Session picker (step 0 for drop-in registrations with sessions) ─────────
  if (showSessionPicker && !selectedSessionId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="max-w-xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold uppercase mb-2" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            Drop-in — {league.name}
          </h1>
          <p className="text-sm text-gray-500 mb-6">Choose the session you&apos;re registering for.</p>
          <div className="space-y-3">
            {dropInSessions.map(session => {
              const date = new Date(session.scheduled_at)
              const isFull = session.capacity !== null && session.registered_count >= session.capacity
              const spotsLeft = session.capacity !== null ? session.capacity - session.registered_count : null
              return (
                <button
                  key={session.id}
                  type="button"
                  disabled={isFull}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full text-left bg-white border rounded-lg px-5 py-4 transition-colors ${
                    isFull
                      ? 'opacity-50 cursor-not-allowed border-gray-200'
                      : 'hover:border-gray-400 hover:shadow-sm border-gray-200'
                  }`}
                >
                  <p className="font-semibold text-gray-900">
                    {date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    {spotsLeft !== null && (
                      <span className={`ml-2 ${spotsLeft <= 3 ? 'text-amber-600 font-medium' : ''}`}>
                        · {isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
                      </span>
                    )}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
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
            sessionId={selectedSessionId}
            showTeamCode={!isPerTeam}
            initialTeamCode={!isPerTeam ? initialTeamCode : null}
            onComplete={(regId, teamId) => {
              setRegistrationId(regId)
              if (teamId) setStep1TeamId(teamId)
              advanceStep(2)
            }}
          />
        )}

        {/* Step 2 — Waiver */}
        {step === 2 && (
          <Step2Waiver
            org={org}
            waiver={waiver}
            userId={userId}
            leagueId={league.id}
            leagueName={league.name}
            registrationId={registrationId}
            playerName={profile?.full_name ?? ''}
            playerDob={playerDetails?.date_of_birth ?? null}
            onComplete={async () => {
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

        {/* Step 3 — Add-ons (merchandise), only when merch is configured */}
        {step === 3 && showAddOnsStep && !completing && (
          <StepAddons
            items={leagueMerch}
            onContinue={(sels) => {
              setMerchSelections(sels)
              advanceStep(4)
            }}
            onSkip={() => {
              setMerchSelections([])
              if (showPaymentStep) {
                advanceStep(4)
              } else {
                completeRegistration(registrationId)
              }
            }}
            onBack={() => advanceStep(2)}
          />
        )}

        {/* Step 3 — Manual / offline payment instructions */}
        {step === 3 && showManualPaymentStep && !completing && (
          <div className="bg-white rounded-lg border p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Payment Required</h2>
              <p className="text-sm text-gray-500 mt-1">
                Your registration fee is{' '}
                <strong className="text-gray-800">
                  ${(effectivePriceCents / 100).toFixed(2)}
                </strong>
                . Payment is collected offline — please follow the instructions below.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              {manualPaymentInstructions ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{manualPaymentInstructions}</p>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  Please contact the organizer for payment instructions.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => completeRegistration(registrationId)}
              disabled={completing}
              className="w-full py-3 rounded-lg font-semibold text-white text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Complete Registration →
            </button>
            <button
              type="button"
              onClick={() => advanceStep(waiver ? 2 : 1)}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        {/* Step 3 (no merch) or Step 4 (with merch) — Per-player payment */}
        {/* Also step 3 for admin-invited captains on per-team paid leagues */}
        {((step === 3 && showPaymentStep && !showAddOnsStep) || (step === 4 && showAddOnsStep && (showPaymentStep || merchSelections.length > 0)) || (step === 3 && showCaptainPaymentStep)) && !completing && (
          <Step3Payment
            org={org}
            league={league}
            userId={userId}
            registrationId={registrationId!}
            priceCents={effectivePriceCents}
            merchSelections={merchSelections}
            leagueMerch={leagueMerch}
            onBack={() => advanceStep(showAddOnsStep ? 3 : (waiver ? 2 : 1))}
          />
        )}

        {/* Step 3 — Captain: create/name team (only when no inline payment step) */}
        {step === 3 && isPerTeam && isCaptain && !showCaptainPaymentStep && !completing && (
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
            initialTeamCode={initialTeamCode}
            onComplete={async (teamId?: string) => {
              // Activate registration now that the player has joined (or skipped) team selection
              if (registrationId) await activateRegistration(registrationId)
              // If the player arrived via an invite link and we know the team, send them there
              if (teamId && initialTeamCode) {
                router.push(`/teams/${teamId}`)
              } else {
                router.push(`/register/${league.slug}/success`)
              }
            }}
            onBack={() => advanceStep(2)}
          />
        )}
      </div>
    </div>
  )
}
