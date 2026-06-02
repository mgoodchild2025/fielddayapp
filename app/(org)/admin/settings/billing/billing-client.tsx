'use client'

import { useState, useTransition } from 'react'
import {
  createSubscriptionCheckout,
  createCustomerPortalSession,
  changeSubscriptionPlan,
  hibernateSubscription,
  resumeFromHibernation,
  switchToFreePlan,
  requestAccountDeletion,
} from '@/actions/billing'
import type { SubscriptionRow } from '@/actions/billing'
import { HelpLink } from '@/components/ui/help-link'

const PLANS = [
  {
    tier: 'free' as const,
    name: 'Free',
    price: 0,
    color: 'border-gray-200',
    badge: '',
    features: [
      '1 active league',
      'Up to 50 players',
      'Online registration & payments',
      'Schedule, standings & RSVP',
      'Email notifications',
      'Waivers',
    ],
  },
  {
    tier: 'starter' as const,
    name: 'Starter',
    price: 39,
    color: 'border-gray-200',
    badge: '',
    features: [
      '3 active leagues',
      'Up to 150 players',
      'Pools & divisions',
      'Discount codes & early bird pricing',
      'Drop-in events',
      'Stats & leaderboards',
      'Co-organizer access',
    ],
  },
  {
    tier: 'pro' as const,
    name: 'Pro',
    price: 89,
    color: 'border-orange-400',
    badge: 'Most Popular',
    features: [
      '10 active leagues',
      'Up to 500 players',
      'SMS reminders',
      'Payment plans',
      'Double elimination brackets',
      'Everything in Starter',
    ],
  },
  {
    tier: 'club' as const,
    name: 'Club',
    price: 179,
    color: 'border-gray-200',
    badge: '',
    features: [
      'Unlimited leagues & players',
      'Custom domain',
      'Waived transaction fees',
      'Account manager',
      'Everything in Pro',
    ],
  },
]

type Props = {
  org: { id: string; name: string }
  subscription: SubscriptionRow | null
  successRedirect: boolean
  canceledRedirect: boolean
  activeLeagueCount?: number
  playerCount?: number
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

// Minimum date allowed for hibernate resume (tomorrow)
function minResumeDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function BillingPageClient({ org, subscription, successRedirect, canceledRedirect, activeLeagueCount = 0, playerCount = 0 }: Props) {
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHibernateForm, setShowHibernateForm] = useState(false)
  const [hibernateResumeDate, setHibernateResumeDate] = useState('')
  const [showCloseAccount, setShowCloseAccount] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [closeConfirmName, setCloseConfirmName] = useState('')
  const [closeSent, setCloseSent] = useState(false)

  const status  = subscription?.status ?? 'trialing'
  const tier    = subscription?.plan_tier ?? 'free'
  const trialDays = daysUntil(subscription?.trial_end ?? null)
  const isTrialing    = status === 'trialing'
  const isActive      = status === 'active'
  const isPastDue     = status === 'past_due'
  const isCanceled    = status === 'canceled'
  const isHibernating = status === 'hibernating'
  const isFree        = tier === 'free' && isActive
  const hasStripeSubscription = !!subscription?.stripe_subscription_id

  // Tiers that can upgrade via Stripe checkout (not free, not internal)
  const upgradeableTiers = ['starter', 'pro', 'club'] as const
  type UpgradeableTier = typeof upgradeableTiers[number]

  function handleUpgrade(planTier: UpgradeableTier) {
    setError(null)
    setPendingAction(`upgrade-${planTier}`)
    startTransition(async () => {
      const result = await createSubscriptionCheckout(planTier)
      if ('error' in result) { setError(result.error); setPendingAction(null) }
      else { window.location.href = result.url }
    })
  }

  function handleManage() {
    setError(null)
    setPendingAction('portal')
    startTransition(async () => {
      const result = await createCustomerPortalSession()
      if ('error' in result) { setError(result.error); setPendingAction(null) }
      else { window.location.href = result.url }
    })
  }

  function handleHibernate() {
    setError(null)
    setPendingAction('hibernate')
    const resumeAt = hibernateResumeDate || null
    startTransition(async () => {
      const result = await hibernateSubscription(resumeAt)
      if (result.error) { setError(result.error); setPendingAction(null) }
      else { window.location.reload() }
    })
  }

  function handleResume() {
    setError(null)
    setPendingAction('resume')
    startTransition(async () => {
      const result = await resumeFromHibernation()
      if (result.error) { setError(result.error); setPendingAction(null) }
      else { window.location.reload() }
    })
  }

  function handleRequestDeletion() {
    setError(null)
    setPendingAction('delete')
    startTransition(async () => {
      const result = await requestAccountDeletion(closeReason || undefined)
      if (result.error) { setError(result.error); setPendingAction(null) }
      else { setCloseSent(true); setPendingAction(null) }
    })
  }

  function handleSwitchToFree() {
    setError(null)
    setPendingAction('free')
    startTransition(async () => {
      const result = await switchToFreePlan()
      if (result.error) { setError(result.error); setPendingAction(null) }
      else { window.location.reload() }
    })
  }

  function handleChangePlan(planTier: UpgradeableTier) {
    setError(null)
    setPendingAction(`change-${planTier}`)
    startTransition(async () => {
      const result = await changeSubscriptionPlan(planTier)
      if (result.error) { setError(result.error); setPendingAction(null) }
      else { window.location.reload() }
    })
  }

  // Whether the org exceeds free tier limits (blocks downgrade to free)
  const exceedsFreeLimit = activeLeagueCount > 1 || playerCount > 50

  // Show the plan grid in every state except hibernating (resume first).
  // Existing subscribers see all plans with their current one highlighted;
  // switching between paid plans routes through the Stripe billing portal.
  const showPlanGrid = !isHibernating

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
          <span>✓</span><span>Your subscription has been activated. Thank you!</span>
        </div>
      )}
      {canceledRedirect && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          Checkout was canceled — no charge was made.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Current plan card ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Current Plan</h2>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900 capitalize">{tier}</span>
              {isTrialing && (
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5">Free trial</span>
              )}
              {isActive && (
                <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5">Active</span>
              )}
              {isFree && (
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5">Free forever</span>
              )}
              {isHibernating && (
                <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5">❄️ Hibernating</span>
              )}
              {isPastDue && (
                <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5">Payment past due</span>
              )}
              {isCanceled && (
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5">Canceled</span>
              )}
            </div>
          </div>
        </div>

        {/* Trial progress bar */}
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

        {/* Next renewal */}
        {isActive && !isFree && subscription?.current_period_end && (
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

        {/* Hibernating info */}
        {isHibernating && (
          <div className="px-5 py-4 bg-blue-50">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">❄️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900 mb-1">Account is hibernating</p>
                <p className="text-sm text-blue-700 mb-3">
                  Your data is fully preserved at $9/mo.
                  Public-facing pages are replaced with an off-season message.
                  {subscription?.hibernate_until
                    ? ` Auto-resumes on ${formatDate(subscription.hibernate_until)}.`
                    : ' Resume anytime.'}
                </p>
                <button
                  onClick={handleResume}
                  disabled={isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {pendingAction === 'resume' ? 'Resuming…' : `Wake up (restore ${subscription?.pre_hibernate_tier ?? 'paid'} plan)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Past due */}
        {isPastDue && (
          <div className="px-5 py-4 bg-red-50">
            <p className="text-sm text-red-700">
              <strong>Payment failed.</strong> Please update your payment method to keep your account active.
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

      {/* ── Plan grid — upgrade / choose plan ────────────────────────────────── */}
      {showPlanGrid && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {isTrialing
              ? 'Choose a plan to continue after your trial'
              : isCanceled
              ? 'Subscribe to reactivate your account'
              : hasStripeSubscription
              ? 'Change your plan'
              : 'Upgrade to unlock more leagues, players, and features'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.tier === tier && (isActive || isFree)
              return (
                <div
                  key={plan.tier}
                  className={`relative rounded-xl border-2 bg-white p-5 flex flex-col ${isCurrent ? 'border-green-400 ring-1 ring-green-200' : plan.color}`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-orange-500 text-white text-xs font-semibold px-3 py-0.5">
                      {plan.badge}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-green-500 text-white text-xs font-semibold px-3 py-0.5">
                      Current
                    </span>
                  )}
                  <div className="mb-4">
                    <p className="font-bold text-gray-900 text-base">{plan.name}</p>
                    <p className="mt-1">
                      {plan.price === 0
                        ? <span className="text-2xl font-bold text-gray-900">Free</span>
                        : <><span className="text-2xl font-bold text-gray-900">${plan.price}</span><span className="text-sm text-gray-500">/mo</span></>
                      }
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
                  {plan.tier === 'free' ? (
                    isCurrent ? (
                      <div className="w-full rounded-lg py-2 text-sm font-semibold text-center text-green-700 bg-green-50 border border-green-200">
                        Your current plan
                      </div>
                    ) : hasStripeSubscription ? (
                      <div className="w-full rounded-lg py-2 text-sm font-medium text-center text-gray-400 bg-gray-50 border border-gray-200">
                        Cancel subscription first
                      </div>
                    ) : exceedsFreeLimit ? (
                      <div className="space-y-1.5">
                        <div className="w-full rounded-lg py-2 text-sm font-medium text-center text-amber-700 bg-amber-50 border border-amber-200 cursor-not-allowed">
                          Limits exceeded
                        </div>
                        <p className="text-xs text-amber-700 leading-snug">
                          {activeLeagueCount > 1 && `${activeLeagueCount} active events (max 1). `}
                          {playerCount > 50 && `${playerCount} players (max 50). `}
                          Archive excess data to downgrade.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handleSwitchToFree}
                        disabled={isPending}
                        className="w-full rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
                      >
                        {isPending && pendingAction === 'free' ? 'Switching…' : 'Continue with Free'}
                      </button>
                    )
                  ) : (
                    <button
                      // Existing subscribers switch paid plans in-app (prorated);
                      // new subscribers start Stripe Checkout.
                      onClick={() => (isCurrent ? undefined : hasStripeSubscription ? handleChangePlan(plan.tier) : handleUpgrade(plan.tier))}
                      disabled={isPending || isCurrent}
                      className={`w-full rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                        isCurrent
                          ? 'bg-gray-100 text-gray-400 cursor-default'
                          : plan.tier === 'pro'
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'bg-gray-900 hover:bg-gray-700 text-white'
                      }`}
                    >
                      {isCurrent
                        ? 'Current plan'
                        : hasStripeSubscription
                        ? (pendingAction === `change-${plan.tier}` ? 'Switching…' : `Switch to ${plan.name}`)
                        : (isPending && pendingAction === `upgrade-${plan.tier}` ? 'Redirecting…' : `Choose ${plan.name}`)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-gray-400 text-center">
            Paid plans billed monthly · Cancel anytime · Secure checkout via Stripe
          </p>
        </div>
      )}

      {/* ── Active subscriber manage button ───────────────────────────────────── */}
      {isActive && hasStripeSubscription && !isFree && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Payment &amp; Cancellation</h2>
          <p className="text-sm text-gray-500 mb-3">
            Update your payment method, view invoices, or cancel your subscription through the Stripe billing portal.
            To change plans, use the options above.
          </p>
          <button
            onClick={handleManage}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {pendingAction === 'portal' ? 'Opening portal…' : 'Open billing portal →'}
          </button>
          <p className="mt-3 text-xs text-gray-400">
            To cancel, open the billing portal and select <strong className="text-gray-500">Cancel plan</strong>. Your subscription stays active until the end of the current billing period.
          </p>
        </div>
      )}

      {/* ── Hibernate section — only for active paid subscribers ─────────────── */}
      {isActive && hasStripeSubscription && !isFree && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
            ❄️ Hibernate for the off-season
          </h2>
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">
            Running a summer or winter-only league? Hibernate your account during the off-season.
            All your data, player profiles, and settings are fully preserved for just{' '}
            <strong className="text-gray-700">$9/month</strong>.
            Your public site will show an off-season message to visitors.
          </p>

          {!showHibernateForm ? (
            <button
              onClick={() => setShowHibernateForm(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Hibernate my account →
            </button>
          ) : (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Auto-resume date <span className="text-gray-400 font-normal">(optional — leave blank to resume manually)</span>
                </label>
                <input
                  type="date"
                  min={minResumeDate()}
                  value={hibernateResumeDate}
                  onChange={(e) => setHibernateResumeDate(e.target.value)}
                  className="block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  {hibernateResumeDate
                    ? `Your account will auto-resume on ${new Date(hibernateResumeDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })} and be billed at your current plan rate.`
                    : 'You can resume manually anytime from this page.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleHibernate}
                  disabled={isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {pendingAction === 'hibernate' ? 'Hibernating…' : 'Confirm hibernate'}
                </button>
                <button
                  onClick={() => { setShowHibernateForm(false); setHibernateResumeDate('') }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ Once hibernated, your public site will show an off-season page immediately.
                You will be charged $9/mo until you resume.
              </p>
            </div>
          )}
        </div>
      )}
      {/* ── Close account ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Close Account</h2>
        <p className="text-sm text-gray-500 mb-3">
          Permanently delete your organization and all associated data — leagues, teams, players, scores, and payments history.
        </p>

        {closeSent ? (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            ✓ Your request has been received. Our team will be in touch within 1–2 business days to confirm deletion.
          </div>
        ) : !showCloseAccount ? (
          <button
            onClick={() => setShowCloseAccount(true)}
            className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
          >
            I want to close my account →
          </button>
        ) : (
          <div className="space-y-4 border border-red-200 rounded-lg p-4 bg-red-50">
            {/* Blocker: active paid subscription */}
            {hasStripeSubscription && isActive && (
              <div className="flex items-start gap-2 text-sm text-red-700">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>
                  You have an active subscription. Please{' '}
                  <button onClick={handleManage} className="underline font-medium">cancel it via the billing portal</button>
                  {' '}first, then return here to close your account.
                </span>
              </div>
            )}

            {/* What gets deleted */}
            <div>
              <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">What will be permanently deleted</p>
              <ul className="space-y-1">
                {[
                  'All leagues, schedules, and game results',
                  'All team and player registrations',
                  'All payment and waiver records',
                  'Your organization profile and branding',
                  'All uploaded files and media',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs text-red-700">
                    <span className="shrink-0">✕</span>{item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Optional reason */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Reason for leaving <span className="text-gray-400 font-normal">(optional — helps us improve)</span>
              </label>
              <textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="e.g. Switching to another platform, shutting down our league, etc."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
              />
            </div>

            {/* Confirm by typing org name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Type <strong className="text-gray-900">{org.name}</strong> to confirm
              </label>
              <input
                type="text"
                value={closeConfirmName}
                onChange={(e) => setCloseConfirmName(e.target.value)}
                placeholder={org.name}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRequestDeletion}
                disabled={isPending || closeConfirmName !== org.name || (hasStripeSubscription && isActive)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pendingAction === 'delete' ? 'Submitting…' : 'Request account deletion'}
              </button>
              <button
                onClick={() => { setShowCloseAccount(false); setCloseReason(''); setCloseConfirmName('') }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-gray-500">
              This submits a deletion request to our team. We&apos;ll confirm via email and complete the deletion within 1–2 business days. This action cannot be undone.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
