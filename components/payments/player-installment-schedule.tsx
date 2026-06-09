'use client'

import { useRouter } from 'next/navigation'
import { InstallmentSchedule } from './installment-schedule'
import type { InstallmentRow } from './installment-schedule'

interface Props {
  installments: InstallmentRow[]
  currency?: string
}

/**
 * Player-facing wrapper around InstallmentSchedule.
 * Handles "Pay →" by creating a Stripe Checkout session and redirecting.
 */
export function PlayerInstallmentSchedule({ installments, currency }: Props) {
  const router = useRouter()

  async function handlePayClick(installmentId: string) {
    const res = await fetch('/api/stripe/installment-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error ?? 'Unable to start payment. Please try again.')
      return
    }

    const { url } = await res.json()
    if (url) {
      router.push(url)
    }
  }

  return (
    <InstallmentSchedule
      installments={installments}
      currency={currency}
      onPayClick={handlePayClick}
    />
  )
}
