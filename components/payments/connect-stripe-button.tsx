'use client'

import { useState, useTransition } from 'react'
import { getConnectOnboardingUrl } from '@/actions/stripe-connect'

export function ConnectStripeButton({ label }: { label: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await getConnectOnboardingUrl()
      if ('error' in result) {
        setError(result.error)
      } else {
        window.location.href = result.url
      }
    })
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {pending ? 'Redirecting to Stripe…' : label}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
