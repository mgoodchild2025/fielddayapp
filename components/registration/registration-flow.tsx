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
}

const ALL_STEPS = ['Player Details', 'Waiver', 'Payment']

export function RegistrationFlow({ org, league, waiver, profile, playerDetails, userId, initialStep = 1, initialRegistrationId = null, hasOnlinePayments = false, positions = [] }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const [registrationId, setRegistrationId] = useState<string | null>(initialRegistrationId)
  const [completing, setCompleting] = useState(false)

  const showPaymentStep = league.price_cents > 0 && hasOnlinePayments
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
            Register — {league.name}
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
            onComplete={(regId) => { setRegistrationId(regId); setStep(2) }}
          />
        )}
        {step === 2 && (
          <Step2Waiver
            org={org}
            waiver={waiver}
            userId={userId}
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
          />
        )}
      </div>
    </div>
  )
}
