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
    <section className="relative overflow-hidden bg-slate-950 text-white min-h-[520px] sm:min-h-[600px]">
      {/* Background photo */}
      <Image
        src="/FieldDay.png"
        alt=""
        fill
        priority
        className="object-cover object-[center_35%] sm:object-center"
        sizes="100vw"
      />

      {/* Desktop scrim — heavy left (text side), fades to lighter right (photo side) */}
      <div className="absolute inset-0 hidden sm:block bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/25" />

      {/* Mobile scrim — top-to-bottom so text above the action reads clearly */}
      <div className="absolute inset-0 sm:hidden bg-gradient-to-b from-slate-950/85 via-slate-950/65 to-slate-950/50" />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-24 sm:py-36 flex flex-col sm:flex-row sm:items-center">
        {/* Text column — full width on mobile, ~55% on desktop */}
        <div className="sm:w-[55%] text-center sm:text-left">
          <div className="inline-flex bg-white rounded-xl overflow-hidden mb-8 shadow-lg p-4">
            <Image
              src="/Fieldday-og.png"
              alt="Fieldday"
              width={839}
              height={247}
              className="w-48 sm:w-64 h-auto"
              priority
            />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-5">
            Run your league,<br className="hidden sm:block" />
            <span className="text-emerald-400"> not the paperwork.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 mb-10 leading-relaxed max-w-xl mx-auto sm:mx-0">
            Fieldday handles scheduling, registrations, payments, standings, and team
            communications — all in one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center sm:justify-start gap-4">
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
          <p className="mt-5 text-sm text-slate-400 text-center sm:text-left">
            15-day free trial · No credit card required
          </p>
        </div>
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
    desc: 'Players register and pay online. Your roster fills automatically - no spreadsheets.',
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
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['1 active league', 'Up to 50 players', 'Online registration & payments'],
    popular: false,
    cta: 'Get started free',
    ctaHref: '/signup?plan=free',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 39,
    features: ['3 active leagues', 'Up to 200 players', 'Custom branding & nav links'],
    popular: false,
    cta: 'Start free trial →',
    ctaHref: '/signup?plan=starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 89,
    features: ['10 active leagues', 'Up to 1,000 players', 'SMS, merch shop & check-in'],
    popular: true,
    cta: 'Start free trial →',
    ctaHref: '/signup?plan=pro',
  },
  {
    id: 'club',
    name: 'Club',
    price: 179,
    features: ['Unlimited leagues & players', 'Custom domain', 'Dedicated account manager'],
    popular: false,
    cta: 'Start free trial →',
    ctaHref: '/signup?plan=club',
  },
] as const

function Pricing() {
  return (
    <section id="pricing" className="bg-gray-50 px-6 py-20 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-500">
            Start for free, or trial any paid plan free for 15 days. No credit card required.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl p-7 ${
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
                  {plan.price === 0 ? (
                    <span className="text-4xl font-extrabold text-gray-900">Free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                      <span className="text-gray-400 text-sm ml-1">/month</span>
                    </>
                  )}
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
                href={plan.ctaHref}
                className={`block text-center py-3 rounded-xl text-sm font-semibold transition-colors ${
                  plan.popular
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
                    : plan.id === 'free'
                    ? 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-8">
          Paid plans include a 15-day free trial. Cancel anytime.{' '}
          <a href="#features" className="text-emerald-600 hover:underline font-medium">
            Compare all features ↓
          </a>
        </p>
      </div>
    </section>
  )
}

// ── Feature matrix ────────────────────────────────────────────────────────────

function Check() {
  return (
    <svg className="w-5 h-5 text-emerald-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function Dash() {
  return <span className="block text-center text-gray-300 font-light text-lg leading-none">—</span>
}

type Cell = 'check' | 'dash' | string

const MATRIX: Array<{
  section?: string
  label?: string
  free?: Cell
  starter?: Cell
  pro?: Cell
  club?: Cell
}> = [
  { section: 'Events' },
  { label: 'Active events',              free: '1',             starter: '3',          pro: '10',         club: 'Unlimited' },
  { label: 'Registered players',         free: '50',            starter: '200',        pro: '1,000',      club: 'Unlimited' },
  { label: 'Leagues & tournaments',      free: 'check',         starter: 'check',      pro: 'check',      club: 'check' },
  { label: 'Drop-in events',             free: 'dash',          starter: 'dash',       pro: 'check',      club: 'check' },
  { label: 'Recurring sessions',         free: 'dash',          starter: 'dash',       pro: 'check',      club: 'check' },
  { label: 'QR code check-in',           free: 'dash',          starter: 'dash',       pro: 'check',      club: 'check' },

  { section: 'Scheduling' },
  { label: 'Game schedule builder',              free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Single-elimination brackets',        free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Double-elimination brackets',        free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Pools & divisions',                  free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Game substitute management',         free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'CSV schedule import',                free: 'dash',   starter: 'dash',  pro: 'dash',  club: 'check' },
  { label: 'Print scoresheets',                  free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },

  { section: 'Registration & Payments' },
  { label: 'Online registration',                free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Team or individual registration',    free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Stripe payments',                    free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Digital waivers + QR signing',       free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Early bird pricing',                 free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Discount / promo codes',             free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Merchandise shop',                   free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },

  { section: 'Stats & Communications' },
  { label: 'Live standings',                     free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Captain score submission',           free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Player stats & leaderboards',        free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Email notifications',                free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'SMS reminders',                      free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },

  { section: 'Customisation' },
  { label: 'Custom branding (logo, colours)',    free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Custom navigation links',            free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Photo gallery',                      free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Event rules templates',              free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Custom player positions',            free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Co-organizer accounts',              free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Custom favicon',                     free: 'dash',   starter: 'dash',  pro: 'dash',  club: 'check' },
  { label: 'Custom domain',                      free: 'dash',   starter: 'dash',  pro: 'dash',  club: 'check' },
]

function CellValue({ value }: { value: Cell | undefined }) {
  if (!value || value === 'dash') return <Dash />
  if (value === 'check') return <Check />
  return <span className="block text-center text-sm font-semibold text-gray-700">{value}</span>
}

function FeatureMatrix() {
  return (
    <section id="features" className="bg-white px-4 sm:px-6 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Compare all features
          </h2>
          <p className="text-lg text-gray-500">
            Everything included in each plan, side by side.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-5 bg-gray-50 border-b border-gray-200">
            <div className="px-5 py-4" />
            {[
              { name: 'Free',    price: 'Free',  popular: false },
              { name: 'Starter', price: '$39',   popular: false },
              { name: 'Pro',     price: '$89',   popular: true  },
              { name: 'Club',    price: '$179',  popular: false },
            ].map((plan) => (
              <div key={plan.name} className={`px-3 py-4 text-center border-l border-gray-200 ${plan.popular ? 'bg-emerald-50' : ''}`}>
                {plan.popular && (
                  <span className="inline-block mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                    Most Popular
                  </span>
                )}
                <p className={`font-bold text-sm ${plan.popular ? 'text-emerald-700' : 'text-gray-900'}`}>{plan.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{plan.price === 'Free' ? 'Free forever' : `${plan.price}/mo`}</p>
              </div>
            ))}
          </div>

          {/* Rows */}
          {MATRIX.map((row, i) => {
            if (row.section) {
              return (
                <div key={row.section} className={`grid grid-cols-5 bg-gray-50 border-t border-gray-200 ${i === 0 ? '' : 'border-t-2'}`}>
                  <div className="col-span-5 px-5 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{row.section}</span>
                  </div>
                </div>
              )
            }
            return (
              <div key={row.label} className="grid grid-cols-5 border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                <div className="px-5 py-3.5 flex items-center">
                  <span className="text-sm text-gray-700">{row.label}</span>
                </div>
                <div className="px-3 py-3.5 flex items-center justify-center border-l border-gray-100">
                  <CellValue value={row.free} />
                </div>
                <div className="px-3 py-3.5 flex items-center justify-center border-l border-gray-100">
                  <CellValue value={row.starter} />
                </div>
                <div className="px-3 py-3.5 flex items-center justify-center border-l border-gray-100 bg-emerald-50/40">
                  <CellValue value={row.pro} />
                </div>
                <div className="px-3 py-3.5 flex items-center justify-center border-l border-gray-100">
                  <CellValue value={row.club} />
                </div>
              </div>
            )
          })}

          {/* CTA row */}
          <div className="grid grid-cols-5 border-t-2 border-gray-200 bg-gray-50">
            <div className="px-5 py-5" />
            {([
              { id: 'free',    label: 'Get started free', popular: false },
              { id: 'starter', label: 'Start free trial', popular: false },
              { id: 'pro',     label: 'Start free trial', popular: true  },
              { id: 'club',    label: 'Start free trial', popular: false },
            ] as const).map((plan) => (
              <div key={plan.id} className={`px-3 py-5 border-l border-gray-200 ${plan.popular ? 'bg-emerald-50' : ''}`}>
                <Link
                  href={`/signup?plan=${plan.id}`}
                  className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    plan.popular
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : plan.id === 'free'
                      ? 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300'
                      : 'bg-gray-900 hover:bg-gray-800 text-white'
                  }`}
                >
                  {plan.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
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
        <a href="https://docs.fielddayapp.ca" className="hover:text-gray-600 transition-colors">Docs</a>
        {' · '}
        <a href="/legal/tenant-privacy" className="hover:text-gray-600 transition-colors">Privacy</a>
        {' · '}
        <a href="/legal/terms" className="hover:text-gray-600 transition-colors">Terms</a>
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
      <FeatureMatrix />
      <MarketingFooter />
    </div>
  )
}
