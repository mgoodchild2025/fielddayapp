'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Step1PlayerDetails } from './step1-player-details'
import { Step2Waiver } from './step2-waiver'
import { Step3Payment } from './step3-payment'
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
}

const ALL_STEPS = ['Player Details', 'Waiver', 'Payment']

export function RegistrationFlow({ org, league, waiver, profile, playerDetails, userId, initialStep = 1, initialRegistrationId = null, hasOnlinePayments = false, positions = [], isDropIn = false, dropInPriceCents = null, captainTeamId = null }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const [registrationId, setRegistrationId] = useState<string | null>(initialRegistrationId)
  const [completing, setCompleting] = useState(false)

  const effectivePriceCents = isDropIn ? (dropInPriceCents ?? 0) : league.price_cents
  // Per-team leagues: captain pays on the team page — individuals skip payment
  const isPerTeam = (league as unknown as { payment_mode?: string }).payment_mode === 'per_team'
  const showPaymentStep = effectivePriceCents > 0 && hasOnlinePayments && !isPerTeam
  const showTeamPaymentNotice = isPerTeam && effectivePriceCents > 0
  const steps = showPaymentStep ? ALL_STEPS : ALL_STEPS.filter(s => s !== 'Payment')

  // Activate and navigate to the success page — never call a server action and then
  // setStep(4), which would cause Next.js to re-render the parent server component
  // and double-show the "You're Registered" screen.
  async function completeRegistration(regId: string | null) {
    setCompleting(true)
    if (regId) await activateRegistration(regId)
    router.push(`/register/${league.slug}/success`)
  }

  async function afterWaiver() {
    if (showPaymentStep) {
      setStep(3)
    } else if (showTeamPaymentNotice) {
      // Per-team: activate immediately — captain pays separately on the team page
      setStep(3)
    } else {
      await completeRegistration(registrationId)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold uppercase mb-4" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            {isDropIn ? 'Drop-in — ' : 'Register — '}{league.name}
          </h1>
          <div className="flex items-center gap-1">
            {steps.map((label, i) => {
              // Map display step index to internal step number
              const internalStep = ALL_STEPS.indexOf(label) + 1
              const isActive = internalStep === step
              const isDone = internalStep < step
              return (
                <div key={label} className="flex items-center gap-1 flex-1">
                  <div className={`flex-1 h-1.5 rounded-full ${isDone || isActive ? '' : 'bg-gray-200'}`}
                    style={{ backgroundColor: isDone || isActive ? 'var(--brand-primary)' : undefined }} />
                  {i < steps.length - 1 && (
                    <div className={`h-1.5 w-6 rounded-full ${isDone ? '' : 'bg-gray-200'}`}
                      style={{ backgroundColor: isDone ? 'var(--brand-primary)' : undefined }} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((label) => {
              const internalStep = ALL_STEPS.indexOf(label) + 1
              return (
                <p key={label} className="text-xs text-gray-500" style={{ color: internalStep <= step ? 'var(--brand-primary)' : undefined }}>
                  {label}
                </p>
              )
            })}
          </div>
        </div>

        {step === 1 && (
          <Step1PlayerDetails
            org={org}
            profile={profile}
            playerDetails={playerDetails}
            league={league}
            userId={userId}
            positions={positions}
            registrationType={isDropIn ? 'drop_in' : 'season'}
            onComplete={(regId) => { setRegistrationId(regId); setStep(2) }}
          />
        )}
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
          />
        )}
        {completing && (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            Completing registration…
          </div>
        )}
        {step === 3 && showPaymentStep && !completing && (
          <Step3Payment
            org={org}
            league={league}
            userId={userId}
            registrationId={registrationId!}
            priceCents={effectivePriceCents}
          />
        )}
        {step === 3 && showTeamPaymentNotice && !completing && (
          <div className="bg-white rounded-lg border p-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            {captainTeamId ? (
              // Captain registering — send them straight to pay for their team
              <div>
                <h2 className="font-semibold text-lg">Registration saved!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  As team captain, you&apos;re responsible for completing the team payment. Head to your team page to pay and confirm your whole roster.
                </p>
              </div>
            ) : (
              // Regular player
              <div>
                <h2 className="font-semibold text-lg">You&apos;re on the list!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Payment for this event is handled per team. Your team captain will complete the payment — your spot will be confirmed once the team pays.
                </p>
              </div>
            )}
            {captainTeamId ? (
              <a
                href={`/teams/${captainTeamId}`}
                className="block w-full py-3 rounded-md font-semibold text-white text-center"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Go to my team &amp; pay →
              </a>
            ) : (
              <button
                onClick={() => completeRegistration(registrationId)}
                className="w-full py-3 rounded-md font-semibold text-white"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Got it →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
