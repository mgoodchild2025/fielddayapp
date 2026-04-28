'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { orgSignup, checkSlugAvailable } from '@/actions/org-signup'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

// ─── Pricing data ─────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    price: 49,
    period: '/month',
    tagline: 'For small recreational leagues',
    color: 'gray',
    features: [
      '3 active leagues',
      'Up to 200 registered players',
      'Schedule & standings',
      'Admin & captain score entry',
      'Custom branding & colours',
      'Broadcast email to members',
      'Email support',
    ],
    popular: false,
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: 99,
    period: '/month',
    tagline: 'For growing organizations',
    color: 'emerald',
    features: [
      '10 active leagues',
      'Up to 1,000 registered players',
      'Everything in Starter',
      'Drop-in session management',
      'Discount & promo codes',
      'SMS game reminders',
      'Payment installment plans',
      'Priority support',
    ],
    popular: true,
  },
  {
    id: 'club' as const,
    name: 'Club',
    price: 199,
    period: '/month',
    tagline: 'For large multi-sport clubs',
    color: 'slate',
    features: [
      'Unlimited active leagues',
      'Unlimited players',
      'Everything in Pro',
      'Custom domain (yourleague.com)',
      'White-glove onboarding',
      'Dedicated account manager',
    ],
    popular: false,
  },
] as const

type PlanId = (typeof PLANS)[number]['id']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 30)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function PricingCard({
  plan,
  selected,
  onSelect,
}: {
  plan: (typeof PLANS)[number]
  selected: boolean
  onSelect: (id: PlanId) => void
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 p-7 transition-all ${
        plan.popular
          ? 'border-emerald-500 shadow-xl shadow-emerald-100'
          : selected
          ? 'border-emerald-300 shadow-md'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wide uppercase">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{plan.tagline}</p>
      </div>

      <div className="mb-6">
        <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
        <span className="text-gray-400 text-sm ml-1">{plan.period}</span>
        <p className="text-xs text-emerald-600 font-medium mt-1.5">15-day free trial — no credit card required</p>
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan.id)}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
          plan.popular
            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-200'
            : 'bg-gray-900 hover:bg-gray-800 text-white'
        }`}
      >
        Start free trial →
      </button>
    </div>
  )
}

// ─── Main signup form ─────────────────────────────────────────────────────────

function SignupForm({
  selectedPlan,
  onPlanChange,
  onSuccess,
}: {
  selectedPlan: PlanId
  onPlanChange: (p: PlanId) => void
  onSuccess: (email: string, slug: string) => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkSlug = useCallback((value: string) => {
    if (!value || value.length < 2) { setSlugStatus('idle'); return }
    setSlugStatus('checking')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { available } = await checkSlugAvailable(value)
      setSlugStatus(available ? 'available' : 'taken')
    }, 400)
  }, [])

  function handleOrgNameChange(val: string) {
    setOrgName(val)
    if (!slugManual) {
      const generated = toSlug(val)
      setSlug(generated)
      checkSlug(generated)
    }
  }

  function handleSlugChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)
    setSlug(clean)
    setSlugManual(true)
    checkSlug(clean)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const result = await orgSignup({ orgName, slug, fullName, email, password, plan: selectedPlan })
      if (result.error) {
        setError(result.error)
      } else if (result.slug) {
        onSuccess(email, result.slug)
      }
    })
  }

  const plan = PLANS.find((p) => p.id === selectedPlan)!

  const inputBase =
    'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Plan selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
        <div className="flex gap-2">
          {PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlanChange(p.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                selectedPlan === p.id
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-emerald-300'
              }`}
            >
              {p.name}
              <span className={`block text-xs font-normal ${selectedPlan === p.id ? 'text-emerald-100' : 'text-gray-400'}`}>
                ${p.price}/mo
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Org name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="orgName">
          League / Organization name
        </label>
        <input
          id="orgName"
          type="text"
          required
          value={orgName}
          onChange={(e) => handleOrgNameChange(e.target.value)}
          placeholder="Riverside Volleyball Club"
          className={inputBase}
          autoComplete="organization"
        />
      </div>

      {/* Subdomain */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="slug">
          Your subdomain
        </label>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-400 focus-within:border-transparent transition">
          <input
            id="slug"
            type="text"
            required
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="riverside-vc"
            className="flex-1 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
          />
          <span className="px-3 py-2.5 bg-gray-50 border-l border-gray-200 text-xs text-gray-500 whitespace-nowrap select-none">
            .{PLATFORM_DOMAIN}
          </span>
        </div>
        <div className="mt-1.5 h-4">
          {slug.length >= 2 && (
            <p className={`text-xs font-medium ${
              slugStatus === 'available' ? 'text-emerald-600' :
              slugStatus === 'taken' ? 'text-red-500' :
              'text-gray-400'
            }`}>
              {slugStatus === 'checking' && 'Checking availability…'}
              {slugStatus === 'available' && `✓ ${slug}.${PLATFORM_DOMAIN} is available`}
              {slugStatus === 'taken' && `✗ "${slug}" is already taken`}
            </p>
          )}
        </div>
      </div>

      {/* Name + email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="fullName">
            Your name
          </label>
          <input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Johnson"
            className={inputBase}
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@yourclub.com"
            className={inputBase}
            autoComplete="email"
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ characters"
            className={`${inputBase} pr-12`}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            tabIndex={-1}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending || slugStatus === 'taken'}
        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm shadow-emerald-200"
      >
        {pending ? 'Creating your account…' : `Start your ${plan.name} trial — free for 15 days`}
      </button>

      <p className="text-xs text-center text-gray-400">
        No credit card required. By continuing you agree to our{' '}
        <a href="#" className="underline hover:text-gray-600">Terms of Service</a> and{' '}
        <a href="#" className="underline hover:text-gray-600">Privacy Policy</a>.
      </p>
    </form>
  )
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ email, slug }: { email: string; slug: string }) {
  const orgUrl = `https://${slug}.${PLATFORM_DOMAIN}/admin/dashboard`

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100 px-6 py-4 flex items-center gap-2">
        <span className="text-emerald-500 font-black text-xl tracking-tight">⚡</span>
        <span className="font-bold text-gray-900 text-lg tracking-tight">Fieldday</span>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Check your inbox</h1>
          <p className="text-gray-500 mb-2">
            We sent a confirmation link to <strong className="text-gray-700">{email}</strong>.
          </p>
          <p className="text-gray-500 mb-8">
            Click the link to verify your email and access your league dashboard.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
            <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Your dashboard will be at</p>
            <p className="text-sm font-mono text-emerald-700 font-semibold break-all">{orgUrl}</p>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            Didn&apos;t get the email? Check your spam folder, or{' '}
            <a href="/signup" className="underline hover:text-gray-600">try again</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Signup disabled screen ───────────────────────────────────────────────────

function SignupsDisabledScreen() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100 px-6 py-4 flex items-center gap-2">
        <span className="text-emerald-500 font-black text-xl tracking-tight">⚡</span>
        <span className="font-bold text-gray-900 text-lg tracking-tight">Fieldday</span>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Sign-ups are paused</h1>
          <p className="text-gray-500">
            We&apos;re not accepting new registrations right now. Please check back soon or contact us for more information.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Full page ────────────────────────────────────────────────────────────────

export function SignupPage({ signupsEnabled }: { signupsEnabled: boolean }) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro')
  const [successData, setSuccessData] = useState<{ email: string; slug: string } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  function selectPlan(planId: PlanId) {
    setSelectedPlan(planId)
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  if (successData) {
    return <SuccessScreen email={successData.email} slug={successData.slug} />
  }

  if (!signupsEnabled) {
    return <SignupsDisabledScreen />
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 font-black text-xl tracking-tight">⚡</span>
          <span className="font-bold text-gray-900 text-lg tracking-tight">Fieldday</span>
        </div>
        <Link
          href="/login"
          className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
        >
          Sign in →
        </Link>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 rounded-full px-4 py-1.5 text-emerald-400 text-sm font-medium mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            15-day free trial — no credit card required
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-5">
            Run your league,<br className="hidden sm:block" />
            <span className="text-emerald-400"> not the paperwork.</span>
          </h1>
          <p className="text-lg text-slate-300 max-w-xl mx-auto mb-10 leading-relaxed">
            Fieldday handles scheduling, standings, registrations, payments, and communications — so you can focus on the game.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
            {['Schedule management', 'Online registration', 'Score tracking', 'Team communications', 'Payment processing'].map((f) => (
              <span key={f} className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h2>
            <p className="text-gray-500">Start your 15-day free trial on any plan. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan === plan.id}
                onSelect={selectPlan}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Signup form */}
      <section ref={formRef} className="px-6 py-20 bg-white scroll-mt-16">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Create your organization</h2>
            <p className="text-gray-500 text-sm">
              Get set up in under 2 minutes. Your 15-day trial starts immediately.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
            <SignupForm
              selectedPlan={selectedPlan}
              onPlanChange={setSelectedPlan}
              onSuccess={(email, slug) => setSuccessData({ email, slug })}
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Fieldday Sports Technology Inc. All rights reserved.</p>
      </footer>
    </div>
  )
}
