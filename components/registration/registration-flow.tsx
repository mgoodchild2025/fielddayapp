'use client'

import { useState } from 'react'
import { Step1PlayerDetails } from './step1-player-details'
import { Step2Waiver } from './step2-waiver'
import { Step3Payment } from './step3-payment'
import { Step4Confirmation } from './step4-confirmation'
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
}

const STEPS = ['Player Details', 'Waiver', 'Payment', 'Confirmation']

export function RegistrationFlow({ org, league, waiver, profile, playerDetails, userId }: Props) {
  const [step, setStep] = useState(1)
  const [registrationId, setRegistrationId] = useState<string | null>(null)
  const [waiverSignatureId, setWaiverSignatureId] = useState<string | null>(null)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold uppercase mb-4" style={{ fontFamily: 'var(--brand-heading-font)' }}>
            Register — {league.name}
          </h1>
          <div className="flex items-center gap-1">
            {STEPS.map((label, i) => {
              const n = i + 1
              const isActive = n === step
              const isDone = n < step
              return (
                <div key={label} className="flex items-center gap-1 flex-1">
                  <div className={`flex-1 h-1.5 rounded-full ${isDone ? '' : isActive ? '' : 'bg-gray-200'}`}
                    style={{ backgroundColor: isDone || isActive ? 'var(--brand-primary)' : undefined }} />
                  {i < STEPS.length - 1 && (
                    <div className={`h-1.5 w-6 rounded-full ${isDone ? '' : 'bg-gray-200'}`}
                      style={{ backgroundColor: isDone ? 'var(--brand-primary)' : undefined }} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((label, i) => (
              <p key={label} className="text-xs text-gray-500" style={{ color: i + 1 <= step ? 'var(--brand-primary)' : undefined }}>
                {label}
              </p>
            ))}
          </div>
        </div>

        {step === 1 && (
          <Step1PlayerDetails
            org={org}
            profile={profile}
            playerDetails={playerDetails}
            league={league}
            userId={userId}
            onComplete={(regId) => { setRegistrationId(regId); setStep(2) }}
          />
        )}
        {step === 2 && (
          <Step2Waiver
            org={org}
            waiver={waiver}
            userId={userId}
            onComplete={(sigId) => {
              setWaiverSignatureId(sigId)
              if (league.price_cents === 0) setStep(4)
              else setStep(3)
            }}
            onSkip={() => { if (league.price_cents === 0) setStep(4); else setStep(3) }}
          />
        )}
        {step === 3 && (
          <Step3Payment
            org={org}
            league={league}
            userId={userId}
            registrationId={registrationId!}
          />
        )}
        {step === 4 && (
          <Step4Confirmation
            league={league}
            registrationId={registrationId}
          />
        )}
      </div>
    </div>
  )
}
