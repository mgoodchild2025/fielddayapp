'use client'

import { useEffect, useRef } from 'react'
import { activateRegistration } from '@/actions/registrations'
import Link from 'next/link'
import type { Database } from '@/types/database'

type League = Database['public']['Tables']['leagues']['Row']

interface Props {
  league: League
  registrationId: string | null
}

export function Step4Confirmation({ league, registrationId }: Props) {
  const activated = useRef(false)

  useEffect(() => {
    if (registrationId && !activated.current) {
      activated.current = true
      activateRegistration(registrationId)
    }
  }, [registrationId])

  return (
    <div className="bg-white rounded-lg border p-8 text-center space-y-4">
      <div className="text-5xl">✅</div>
      <h2 className="text-2xl font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
        You&apos;re Registered!
      </h2>
      <p className="text-gray-600">
        You&apos;re confirmed for <strong>{league.name}</strong>.
      </p>
      {league.season_start_date && (
        <p className="text-sm text-gray-500">
          Season starts {new Date(league.season_start_date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      )}
      <div className="flex flex-col gap-2 pt-2">
        <Link
          href="/dashboard"
          className="w-full py-2.5 rounded-md font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Go to Dashboard
        </Link>
        <Link href="/schedule" className="text-sm text-gray-500 hover:underline">
          View Schedule
        </Link>
      </div>
    </div>
  )
}
