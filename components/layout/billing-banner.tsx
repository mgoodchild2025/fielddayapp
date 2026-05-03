'use client'

import Link from 'next/link'

type Props = {
  status: string
  trialEnd: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function BillingBanner({ status, trialEnd, cancelAtPeriodEnd, currentPeriodEnd }: Props) {
  if (status === 'active' && !cancelAtPeriodEnd) return null

  if (status === 'trialing') {
    const days = daysUntil(trialEnd)
    if (days === null || days > 7) return null

    const urgent = days <= 3
    return (
      <div className={`w-full px-4 py-2 text-sm flex items-center justify-between gap-4 ${urgent ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
        <span>
          {days === 0
            ? '⚠ Your free trial expires today.'
            : `⚠ Your free trial expires in ${days} day${days !== 1 ? 's' : ''}.`}
          {' '}Subscribe to keep your account active.
        </span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Choose a plan →
        </Link>
      </div>
    )
  }

  if (status === 'past_due') {
    return (
      <div className="w-full px-4 py-2 text-sm bg-red-600 text-white flex items-center justify-between gap-4">
        <span>⚠ Your last payment failed. Update your payment method to avoid losing access.</span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Update billing →
        </Link>
      </div>
    )
  }

  if (status === 'canceled') {
    return (
      <div className="w-full px-4 py-2 text-sm bg-gray-700 text-white flex items-center justify-between gap-4">
        <span>Your subscription has been canceled. Reactivate to restore full access.</span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Reactivate →
        </Link>
      </div>
    )
  }

  if (status === 'active' && cancelAtPeriodEnd && currentPeriodEnd) {
    const days = daysUntil(currentPeriodEnd)
    return (
      <div className="w-full px-4 py-2 text-sm bg-amber-500 text-white flex items-center justify-between gap-4">
        <span>
          Your subscription will cancel in {days} day{days !== 1 ? 's' : ''}.
          Reactivate to keep your account running.
        </span>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          Reactivate →
        </Link>
      </div>
    )
  }

  return null
}
