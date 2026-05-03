'use client'

import { useState, useTransition } from 'react'
import { createSubscriptionCheckout, createCustomerPortalSession } from '@/actions/billing'
import type { SubscriptionRow } from '@/actions/billing'
import { HelpLink } from '@/components/ui/help-link'

const PLANS = [
  {
    tier: 'starter' as const,
    name: 'Starter',
    price: 49,
    color: 'border-gray-200',
    badge: '',
    features: ['3 active events', '200 registered players', 'Custom branding', 'Score tracking & standings'],
  },
  {
    tier: 'pro' as const,
    name: 'Pro',
    price: 99,
    color: 'border-orange-400',
    badge: 'Most Popular',
    features: ['10 active events', '1,000 registered players', 'SMS reminders', 'Discount codes', 'Stats & leaderboards'],
  },
  {
    tier: 'club' as const,
    name: 'Club',
    price: 199,
    color: 'border-gray-200',
    badge: '',
    features: ['Unlimited events', 'Unlimited players', 'Custom domain', 'CSV import', 'Account manager'],
  },
]

type Props = {
  org: { id: string; name: string }
  subscription: SubscriptionRow | null
  successRedirect: boolean
  canceledRedirect: boolean
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso))
}

export function BillingPageClient({ subscription, successRedirect, canceledRedirect }: Props) {
  const [isPending, startTransition] = useTransition()
  const [pendingTier, setPendingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const status = subscription?.status ?? 'trialing'
  const tier   = subscription?.plan_tier ?? 'starter'
  const trialDays = daysUntil(subscription?.trial_end ?? null)
  const isTrialing = status === 'trialing'
  const isActive   = status === 'active'
  const isPastDue  = status === 'past_due'
  const isCanceled = status === 'canceled'
  const hasStripeSubscription = !!subscription?.stripe_subscription_id

  function handleUpgrade(planTier: 'starter' | 'pro' | 'club') {
    setError(null)
    setPendingTier(planTier)
    startTransition(async () => {
      const result = await createSubscriptionCheckout(planTier)
      if ('error' in result) {
        setError(result.error)
        setPendingTier(null)
      } else {
        window.location.href = result.url
      }
    })
  }

  function handleManage() {
    setError(null)
    setPendingTier('portal')
    startTransition(async () => {
      const result = await createCustomerPortalSession()
      if ('error' in result) {
        setError(result.error)
        setPendingTier(null)
      } else {
        window.location.href = result.url
      }
    })
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your Fieldday subscription and payment method.</p>
        </div>
        <HelpLink href="https://docs.fielddayapp.ca/org-admins/billing" label="Billing docs" />
      </div>

      {/* Flash messages */}
      {successRedirect && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <span>✓</span>
          <span>Your subscription has been activated. Thank you!</span>
        </div>
      )}
      {canceledRedirect && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          Checkout was canceled — no charge was made.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current status card */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Current Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-lg font-bold text-gray-900 capitalize">{tier}</span>
              {isTrialing && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5">
                  Free trial
                </span>
              )}
              {isActive && (
                <span className="ml-2 inline-flex items-center rounded-full bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5">
                  Active
                </span>
              )}
              {isPastDue && (
                <span className="ml-2 inline-flex items-center rounded-full bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5">
                  Payment past due
                </span>
              )}
              {isCanceled && (
                <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5">
                  Canceled
                </span>
              )}
            </div>
            {hasStripeSubscription && (
              <button
                onClick={handleManage}
                disabled={isPending}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium disabled:opacity-50"
              >
                {pendingTier === 'portal' ? 'Opening…' : 'Manage subscription →'}
              </button>
            )}
          </div>
        </div>

        {isTrialing && trialDays !== null && (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Trial period</span>
              <span className={`text-sm font-semibold ${trialDays <= 3 ? 'text-red-600' : trialDays <= 7 ? 'text-amber-600' : 'text-gray-900'}`}>
                {trialDays === 0 ? 'Expires today' : `${trialDays} day${trialDays !== 1 ? 's' : ''} remaining`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${trialDays <= 3 ? 'bg-red-400' : trialDays <= 7 ? 'bg-amber-400' : 'bg-orange-400'}`}
                style={{ width: `${Math.max(2, Math.min(100, (trialDays / 15) * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">Expires {formatDate(subscription?.trial_end ?? null)}</p>
          </div>
        )}

        {isActive && subscription?.current_period_end && (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Next renewal</span>
              <span className="text-gray-900 font-medium">{formatDate(subscription.current_period_end)}</span>
            </div>
            {subscription.cancel_at_period_end && (
              <p className="mt-1 text-xs text-amber-600">
                ⚠ Your subscription will cancel on {formatDate(subscription.current_period_end)} and will not renew.
              </p>
            )}
          </div>
        )}

        {isPastDue && (
          <div className="px-5 py-4 bg-red-50">
            <p className="text-sm text-red-700">
              <strong>Payment failed.</strong> Please update your payment method to keep your account active.
              You have a short grace period before the account becomes read-only.
            </p>
            <button
              onClick={handleManage}
              disabled={isPending}
              className="mt-2 text-sm font-medium text-red-700 underline disabled:opacity-50"
            >
              Update payment method →
            </button>
          </div>
        )}
      </div>

      {/* Plan selection — shown when trialing, canceled, or wanting to change */}
      {(isTrialing || isCanceled || isActive) && !hasStripeSubscription && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {isTrialing ? 'Choose a plan to continue after your trial' : 'Subscribe to reactivate your account'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`relative rounded-xl border-2 bg-white p-5 flex flex-col ${plan.tier === tier && isTrialing ? plan.color : 'border-gray-200'}`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-orange-500 text-white text-xs font-semibold px-3 py-0.5">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-4">
                  <p className="font-bold text-gray-900 text-base">{plan.name}</p>
                  <p className="mt-1">
                    <span className="text-2xl font-bold text-gray-900">${plan.price}</span>
                    <span className="text-sm text-gray-500">/mo</span>
                  </p>
                </div>
                <ul className="space-y-1.5 flex-1 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={isPending}
                  className={`w-full rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    plan.tier === 'pro'
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-gray-900 hover:bg-gray-700 text-white'
                  }`}
                >
                  {isPending && pendingTier === plan.tier ? 'Redirecting…' : `Choose ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400 text-center">
            Billed monthly · Cancel anytime · Secure checkout via Stripe
          </p>
        </div>
      )}

      {/* Active subscriber — show manage button */}
      {isActive && hasStripeSubscription && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Manage Subscription</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upgrade, downgrade, update your payment method, or cancel your subscription through the Stripe customer portal.
          </p>
          <button
            onClick={handleManage}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {pendingTier === 'portal' ? 'Opening portal…' : 'Open billing portal →'}
          </button>
        </div>
      )}
    </div>
  )
}
