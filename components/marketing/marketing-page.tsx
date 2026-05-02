import Image from 'next/image'
import Link from 'next/link'

// ── Nav ───────────────────────────────────────────────────────────────────────

function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/Fieldday-Icon.png" alt="Fieldday" width={32} height={32} className="rounded-lg" />
          <span className="font-bold text-gray-900 text-lg tracking-tight">Fieldday</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-24 sm:py-32 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-block bg-white rounded-2xl px-2 py-1 mb-10 shadow-lg">
          <Image
            src="/Fieldday-og.png"
            alt="Fieldday"
            width={1200}
            height={800}
            className="w-72 sm:w-135 h-auto"
            priority
          />
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          Run your league,<br className="hidden sm:block" />
          <span className="text-emerald-400"> not the paperwork.</span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
          Fieldday handles scheduling, registrations, payments, standings, and team
          communications — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-900/30 text-base"
          >
            Start free trial →
          </Link>
          <a
            href="#pricing"
            className="w-full sm:w-auto px-8 py-3.5 border border-white/30 hover:border-white/60 text-white font-semibold rounded-xl transition-colors text-base"
          >
            See pricing ↓
          </a>
        </div>
        <p className="mt-5 text-sm text-slate-400">15-day free trial · No credit card required</p>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    color: 'bg-emerald-100 text-emerald-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Schedule Management',
    desc: 'Build leagues, assign courts, and generate week-by-week game times in minutes.',
  },
  {
    color: 'bg-blue-100 text-blue-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    title: 'Online Registration',
    desc: 'Players register and pay online. Your roster fills automatically �� no spreadsheets.',
  },
  {
    color: 'bg-violet-100 text-violet-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    title: 'Payments',
    desc: 'Collect per-player or per-team fees online. Stripe-powered, instant payouts.',
  },
  {
    color: 'bg-amber-100 text-amber-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    title: 'Score Tracking',
    desc: 'Captains submit scores; opponents confirm. Standings update live after every game.',
  },
  {
    color: 'bg-rose-100 text-rose-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Stats & Leaderboards',
    desc: 'Track player stats per game and display season leaderboards for every league.',
  },
  {
    color: 'bg-slate-100 text-slate-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Team Communications',
    desc: 'Send broadcast emails and SMS reminders to your entire roster in one click.',
  },
]

function Features() {
  return (
    <section className="bg-white px-6 py-20 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Everything your league needs
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            One platform. No juggling spreadsheets, group chats, or separate payment tools.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-100 bg-white p-7 hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${f.color}`}>
                {f.icon}
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Sports ────────────────────────────────────────────────────────────────────

const SPORTS = [
  'Volleyball', 'Beach Volleyball', 'Soccer', 'Basketball',
  'Hockey', 'Softball', 'Baseball', 'Flag Football', 'Ultimate Frisbee',
]

function SportsRow() {
  return (
    <section className="bg-gray-50 border-y border-gray-100 px-6 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6">
        Built for your sport
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
        {SPORTS.map((s) => (
          <span
            key={s}
            className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700"
          >
            {s}
          </span>
        ))}
        <span className="px-4 py-1.5 bg-white border border-dashed border-gray-300 rounded-full text-sm font-medium text-gray-400">
          + more
        </span>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    features: ['3 active leagues', 'Up to 200 players', 'Custom branding & colours'],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 99,
    features: ['10 active leagues', 'Up to 1,000 players', 'SMS reminders & discount codes'],
    popular: true,
  },
  {
    id: 'club',
    name: 'Club',
    price: 199,
    features: ['Unlimited leagues & players', 'Custom domain', 'Dedicated account manager'],
    popular: false,
  },
] as const

function Pricing() {
  return (
    <section id="pricing" className="bg-gray-50 px-6 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-500">
            Start your 15-day free trial on any plan. No credit card required.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl p-8 ${
                plan.popular
                  ? 'border-2 border-emerald-500 bg-white shadow-xl shadow-emerald-100'
                  : 'border border-gray-200 bg-white'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wide uppercase">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-3">
                  <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                  <span className="text-gray-400 text-sm ml-1">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/signup?plan=${plan.id}`}
                className={`block text-center py-3 rounded-xl text-sm font-semibold transition-colors ${
                  plan.popular
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                Start free trial →
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-8">
          All plans include a 15-day free trial. Cancel anytime.{' '}
          <Link href="/signup" className="text-emerald-600 hover:underline font-medium">
            Compare all features →
          </Link>
        </p>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function MarketingFooter() {
  return (
    <footer className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
      <p>
        © {new Date().getFullYear()} Fieldday Sports Technology Inc.
        {' · '}
        <a href="#" className="hover:text-gray-600 transition-colors">Privacy</a>
        {' · '}
        <a href="#" className="hover:text-gray-600 transition-colors">Terms</a>
      </p>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MarketingPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />
      <Hero />
      <Features />
      <SportsRow />
      <Pricing />
      <MarketingFooter />
    </div>
  )
}
