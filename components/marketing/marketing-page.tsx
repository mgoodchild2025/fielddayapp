import Image from 'next/image'
import Link from 'next/link'

// ── Nav ───────────────────────────────────────────────────────────────────────

export function MarketingNav() {
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
        src="/FieldDay.jpg"
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
    color: 'bg-blue-100 text-blue-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    title: 'Online Registration & Waivers',
    desc: 'Players and teams register online, sign digital waivers (QR signing at the gym), and your roster fills itself — no spreadsheets.',
  },
  {
    color: 'bg-violet-100 text-violet-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Payments Built for Canada',
    desc: 'Stripe checkout plus e-transfer and cash tracking, with GST/PST/HST handled on every charge — inclusive or added at checkout.',
  },
  {
    color: 'bg-emerald-100 text-emerald-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Schedule Builder',
    desc: 'Build leagues, assign courts, and generate week-by-week game times in minutes. Drop-in sessions and season passes too.',
  },
  {
    color: 'bg-rose-100 text-rose-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Live Standings & Stats',
    desc: 'Captains submit scores, opponents confirm, standings update instantly — with win streaks, player stats, and leaderboards.',
  },
  {
    color: 'bg-amber-100 text-amber-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
      </svg>
    ),
    title: 'Playoffs & Brackets',
    desc: 'Tiered playoffs (Gold/Silver), single and double elimination, or hand-build any bracket shape. Losers can drop into a lower tier.',
  },
  {
    color: 'bg-yellow-100 text-yellow-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    title: 'Medals & Hall of Champions',
    desc: 'Champions earn permanent medals, podiums, and championship banners on a public Hall of Champions your players will actually visit.',
  },
  {
    color: 'bg-sky-100 text-sky-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H4.875C4.254 3.75 3.75 4.254 3.75 4.875v11.25c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    title: 'Player Cards & Gym TV Displays',
    desc: 'Every player gets a flippable trading card with career stats. Put live scoreboards, lineups, and photo walls on the gym TV.',
  },
  {
    color: 'bg-teal-100 text-teal-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    title: 'Financial Tools & Tax Reports',
    desc: 'Per-event P&L, expense receipts, refunds, and date-ranged financial reports with a tax remittance line — ready for your accountant.',
  },
  {
    color: 'bg-slate-100 text-slate-700',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m-18.716-.539A8.959 8.959 0 013 12c0-.778.099-1.533.284-2.253" />
      </svg>
    ),
    title: "Your League's Own Website",
    desc: 'Every org gets a branded site on its own address — schedules, standings, galleries, sponsors, and registration, in your colours.',
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
                      <span className="text-gray-400 text-sm ml-1">/month CAD</span>
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
          Prices in Canadian dollars. Paid plans include a 15-day free trial. Cancel anytime.{' '}
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
  { label: 'Season passes & proration',  free: 'dash',          starter: 'dash',       pro: 'check',      club: 'check' },
  { label: 'Recurring sessions',         free: 'dash',          starter: 'dash',       pro: 'check',      club: 'check' },
  { label: 'QR code check-in',           free: 'dash',          starter: 'dash',       pro: 'check',      club: 'check' },

  { section: 'Scheduling' },
  { label: 'Game schedule builder',              free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Single-elimination brackets',        free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Double-elimination brackets',        free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Tiered playoffs (Gold/Silver)',      free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Custom bracket builder',             free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Courtside mobile score entry',       free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Free scoreboard app (offline PWA)',  free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Pools & divisions',                  free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Game substitute management',         free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'CSV schedule import',                free: 'dash',   starter: 'dash',  pro: 'dash',  club: 'check' },
  { label: 'Print scoresheets',                  free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },

  { section: 'Registration & Payments' },
  { label: 'Online registration',                free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Team or individual registration',    free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Stripe payments',                    free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'E-transfer & cash tracking',         free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Sales tax (GST/PST/HST)',            free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Digital waivers + QR signing',       free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Early bird pricing',                 free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Discount / promo codes',             free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Merchandise shop',                   free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },

  { section: 'Stats & Communications' },
  { label: 'Live standings',                     free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Captain score submission',           free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Player stats & leaderboards',        free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Medals & Hall of Champions',         free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Player trading cards',               free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Gym TV displays',                    free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'Email notifications',                free: 'check',  starter: 'check', pro: 'check', club: 'check' },
  { label: 'SMS reminders',                      free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },

  { section: 'Finances' },
  { label: 'Event & org profit and loss',        free: 'dash',   starter: 'dash',  pro: 'check', club: 'check' },
  { label: 'Financial reports, exports & receipts', free: 'dash', starter: 'dash', pro: 'check', club: 'check' },

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

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
      <p className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/scoreboard" className="hover:text-gray-600 transition-colors">Free scoreboard</Link>
        <Link href="/canada" className="hover:text-gray-600 transition-colors">Built for Canada</Link>
        <Link href="/leagues/volleyball" className="hover:text-gray-600 transition-colors">Volleyball leagues</Link>
        <Link href="/leagues/soccer" className="hover:text-gray-600 transition-colors">Soccer leagues</Link>
        <Link href="/leagues/basketball" className="hover:text-gray-600 transition-colors">Basketball leagues</Link>
        <Link href="/compare/teamsnap" className="hover:text-gray-600 transition-colors">vs TeamSnap</Link>
        <Link href="/compare/leagueapps" className="hover:text-gray-600 transition-colors">vs LeagueApps</Link>
        <Link href="/compare/teamlinkt" className="hover:text-gray-600 transition-colors">vs TeamLinkt</Link>
      </p>
      <p>
        © {new Date().getFullYear()} Fieldday Sports Technology Inc.
        {' · '}
        <a href="https://docs.fielddayapp.ca" className="hover:text-gray-600 transition-colors">Docs</a>
        {' · '}
        <Link href="/legal/tenant-privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
        {' · '}
        <Link href="/legal/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
      </p>
    </footer>
  )
}

// ── Definitional strip ────────────────────────────────────────────────────────
// Plain-HTML entity definition near the top of the page — this is the sentence
// search and AI answer engines quote when asked what Fieldday is.

function Definition() {
  return (
    <section className="bg-white border-b border-gray-100 px-6 py-10">
      <p className="max-w-3xl mx-auto text-center text-gray-600 leading-relaxed">
        <strong className="text-gray-900">Fieldday</strong> is a sports league management
        platform for community sports organizations. Leagues use it to run online
        registration and payments — including e-transfer and GST/HST — build schedules
        and playoff brackets, track live standings, and give every league its own
        branded website.
      </p>
    </section>
  )
}

// ── See it in action ──────────────────────────────────────────────────────────
// Hand-built UI vignettes (not screenshots) so they stay crisp at every size
// and ship no real player data.

function StandingsVignette() {
  const rows = [
    { rank: 1, team: 'Net Assets',      record: '9–1',  streak: 'W6' },
    { rank: 2, team: 'Block Party',     record: '8–2',  streak: 'W2' },
    { rank: 3, team: 'Sets on Fire',    record: '6–4',  streak: 'L1' },
    { rank: 4, team: 'Scared Hitless',  record: '4–6',  streak: 'W1' },
  ]
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden text-left">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">Standings</p>
        <p className="text-xs text-gray-400">Monday Night Volleyball · Week 10</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-gray-50/60' : ''}`}>
              <td className={`px-4 py-2.5 text-xs tabular-nums w-8 ${i < 3 ? 'font-bold text-gray-700' : 'text-gray-400'}`}>{r.rank}</td>
              <td className="px-2 py-2.5 font-medium text-gray-800">{r.team}</td>
              <td className="px-2 py-2.5 text-gray-500 tabular-nums">{r.record}</td>
              <td className="px-4 py-2.5 text-right">
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${r.streak.startsWith('W') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {r.streak}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BracketVignette() {
  const matches = [
    { round: 'Semifinal',  a: 'Net Assets',   as: 25, b: 'Scared Hitless', bs: 19 },
    { round: 'Semifinal',  a: 'Block Party',  as: 23, b: 'Sets on Fire',   bs: 25 },
    { round: 'Gold Medal Match', a: 'Net Assets', as: 25, b: 'Sets on Fire', bs: 22, gold: true },
  ]
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden text-left">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">Playoff Bracket</p>
        <p className="text-xs text-gray-400">Gold Tier · Single Elimination</p>
      </div>
      <div className="p-4 space-y-3">
        {matches.map((m, i) => (
          <div key={i} className={`rounded-xl border p-3 ${m.gold ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200'}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
              {m.gold ? '🥇 ' : ''}{m.round}
            </p>
            {[{ n: m.a, s: m.as }, { n: m.b, s: m.bs }].map((t) => (
              <div key={t.n} className="flex items-center justify-between text-sm py-0.5">
                <span className={t.s === Math.max(m.as, m.bs) ? 'font-bold text-gray-900' : 'text-gray-500'}>{t.n}</span>
                <span className={`tabular-nums ${t.s === Math.max(m.as, m.bs) ? 'font-bold text-gray-900' : 'text-gray-400'}`}>{t.s}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function CourtsideVignette() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden text-left">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">Courtside Mode</p>
        <p className="text-xs text-gray-400">Score entry built for a phone at the gym</p>
      </div>
      <div className="p-4 flex justify-center">
        {/* Phone frame */}
        <div className="w-48 rounded-[1.6rem] border-[6px] border-slate-900 bg-slate-950 p-3 text-white shadow-lg">
          <p className="text-[10px] text-slate-400 text-center mb-2">Court 2 · 7:30 PM</p>
          {[{ team: 'Net Assets', score: 21 }, { team: 'Block Party', score: 18 }].map((t) => (
            <div key={t.team} className="flex items-center justify-between rounded-lg bg-slate-800/80 px-2.5 py-2 mb-2">
              <span className="text-xs font-medium truncate">{t.team}</span>
              <span className="text-lg font-extrabold tabular-nums text-emerald-400">{t.score}</span>
            </div>
          ))}
          <div className="rounded-lg bg-emerald-500 text-center text-xs font-bold py-2">Save score</div>
        </div>
      </div>
    </div>
  )
}

function SeeItInAction() {
  return (
    <section className="bg-white px-6 py-20 sm:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            See it in action
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Live standings your players check on Monday mornings, playoff brackets that
            fill themselves, and game-night tools made for the gym.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <StandingsVignette />
          <BracketVignette />
          <CourtsideVignette />
        </div>
        <p className="text-center mt-10">
          <a
            href="https://kaboom.fielddayapp.ca"
            target="_blank"
            rel="noopener"
            className="inline-block px-6 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold transition-colors"
          >
            Visit a live league running on Fieldday →
          </a>
        </p>
      </div>
    </section>
  )
}

// ── Free scoreboard promo ─────────────────────────────────────────────────────
// The scoreboard is a public free tool (no account) — this section is both the
// pitch and a live demo link, with the integrated version as the upsell.

function ScoreboardPromo() {
  return (
    <section className="bg-slate-950 text-white px-6 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12">
        {/* Phone mockup */}
        <div className="shrink-0 w-56 rounded-[2rem] border-[7px] border-slate-700/70 bg-[#0B1210] p-3 shadow-2xl shadow-black/40 select-none" aria-hidden="true">
          <div className="rounded-2xl px-4 py-6 text-center" style={{ background: 'linear-gradient(180deg, #0E9F6E, #0A7953)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">Net Assets</p>
            <p className="text-6xl font-extrabold tabular-nums leading-none mt-1">21</p>
          </div>
          <div className="flex items-center justify-center gap-2 py-2 text-[10px] font-mono text-slate-500">
            <span className="px-2 py-0.5 rounded bg-white/5">SET 2</span>
            <span className="px-2 py-0.5 rounded bg-white/5">↩ UNDO</span>
          </div>
          <div className="rounded-2xl px-4 py-6 text-center" style={{ background: 'linear-gradient(180deg, #2563EB, #1B4CC0)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">Block Party</p>
            <p className="text-6xl font-extrabold tabular-nums leading-none mt-1">18</p>
          </div>
        </div>

        {/* Pitch */}
        <div className="text-center md:text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">Free tool · no account needed</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            The gym scoreboard that&apos;s always in your pocket
          </h2>
          <p className="text-slate-300 leading-relaxed mb-4 max-w-xl">
            Broken scoreboard? Beach court? Tap a team to score, swipe down to take one back, and track
            sets to 15, 21, or 25. It installs to your home screen, keeps the screen awake, and works
            with no wifi at all — free for everyone, Fieldday league or not.
          </p>
          <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xl">
            Fieldday leagues get the connected version: team names prefill from the schedule, finished
            scores save straight into standings, and live scores appear on the gym TV.
          </p>
          <a
            href="/scoreboard"
            className="inline-block px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-900/30"
          >
            Open the scoreboard →
          </a>
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
// One source of truth: rendered on the page and emitted as FAQPage JSON-LD.

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How much does Fieldday cost?',
    a: 'There is a free plan for one league with up to 50 players. Paid plans are $39, $89, and $179 CAD per month, and every paid plan includes a 15-day free trial — no credit card required.',
  },
  {
    q: 'Can players pay by e-transfer or cash?',
    a: 'Yes. Alongside Stripe card payments, admins can record e-transfer, cash, and cheque payments, and outstanding balances are tracked automatically for every player and team.',
  },
  {
    q: 'Does Fieldday handle GST and HST?',
    a: 'Yes. Set up to two sales tax rates (for example GST + PST), shown included in your prices or added at checkout. Financial reports include a tax remittance line for filing.',
  },
  {
    q: 'Do players need to download an app?',
    a: 'No. Fieldday runs in the browser on any phone, and players can add your league site to their home screen like an app — under your league’s own name and icon.',
  },
  {
    q: 'Can I run drop-in sessions or sell season passes?',
    a: 'Yes. Events can sell per-session spots, season passes, or both at once — and mid-season pass prices prorate automatically to the sessions remaining.',
  },
  {
    q: 'How do playoffs work?',
    a: 'Generate playoff brackets straight from your standings — Gold and Silver tiers, single or double elimination, or hand-build any format. Champions are awarded medals automatically and appear in your Hall of Champions.',
  },
  {
    q: 'Can my league use its own branding and domain?',
    a: 'Every plan includes a branded site with your logo and colours on your own fielddayapp.ca address; the Club plan adds a fully custom domain.',
  },
  {
    q: 'What kinds of leagues use Fieldday?',
    a: 'Community sports organizations — volleyball, soccer, basketball, hockey, softball, flag football, ultimate, and more. It works for leagues, tournaments, and drop-in nights.',
  },
]

function Faq() {
  return (
    <section id="faq" className="bg-gray-50 border-t border-gray-100 px-6 py-20 sm:py-24">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Frequently asked questions
          </h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group rounded-xl border border-gray-200 bg-white px-5 py-4">
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none font-semibold text-gray-900 text-sm sm:text-base">
                {faq.q}
                <span className="text-gray-300 group-open:rotate-45 transition-transform text-xl leading-none shrink-0">+</span>
              </summary>
              <p className="mt-3 text-sm text-gray-500 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Closing CTA ───────────────────────────────────────────────────────────────

export function ClosingCta() {
  return (
    <section className="bg-slate-950 text-white px-6 py-20 text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
          Ready for game night?
        </h2>
        <p className="text-slate-400 text-lg mb-10">
          Set up your league in an afternoon — or talk to a human first.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-900/30"
          >
            Start free trial →
          </Link>
          <a
            href="mailto:hello@fielddayapp.ca?subject=Fieldday%20demo"
            className="w-full sm:w-auto px-8 py-3.5 border border-white/30 hover:border-white/60 text-white font-semibold rounded-xl transition-colors"
          >
            Book a 15-minute demo
          </a>
        </div>
      </div>
    </section>
  )
}

// ── Structured data ───────────────────────────────────────────────────────────
// SoftwareApplication with per-plan offers earns price-annotated search results;
// Organization establishes the publisher entity for search and AI answer engines.

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://fielddayapp.ca/#organization',
      name: 'Fieldday Sports Technology Inc.',
      url: 'https://fielddayapp.ca',
      logo: 'https://fielddayapp.ca/Fieldday-Icon.png',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Fieldday',
      url: 'https://fielddayapp.ca',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Sports league management platform for community sports organizations. Leagues use Fieldday to run online registration and payments (including e-transfer and GST/HST), build schedules and playoff brackets, track live standings, and give every league its own branded website.',
      publisher: { '@id': 'https://fielddayapp.ca/#organization' },
      offers: PLANS.map((plan) => ({
        '@type': 'Offer',
        name: `${plan.name} plan`,
        price: plan.price,
        priceCurrency: 'CAD',
        url: `https://fielddayapp.ca${plan.ctaHref}`,
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ],
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MarketingPage() {
  return (
    <div className="min-h-dvh bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <MarketingNav />
      <Hero />
      <Definition />
      <Features />
      <SportsRow />
      <SeeItInAction />
      <ScoreboardPromo />
      <Pricing />
      <FeatureMatrix />
      <Faq />
      <ClosingCta />
      <MarketingFooter />
    </div>
  )
}
