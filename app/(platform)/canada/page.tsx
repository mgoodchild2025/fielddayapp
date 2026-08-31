import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { MarketingNav, MarketingFooter, ClosingCta } from '@/components/marketing/marketing-page'
import { COMPARISONS, SPORT_PAGES } from '@/lib/marketing-pages'

export const metadata: Metadata = {
  title: 'Canadian Sports League Management Software — Fieldday',
  description:
    'League management software built for Canada: Interac e-transfer and cash tracking, GST/PST/HST on every charge, tax remittance reports, and flat CAD pricing with no platform fees.',
  alternates: { canonical: 'https://fielddayapp.ca/canada' },
  openGraph: {
    title: 'Canadian Sports League Management Software — Fieldday',
    description:
      'E-transfer and cash tracking, GST/PST/HST handling, tax-ready reports, and flat CAD pricing with no platform fees.',
  },
}

const HIGHLIGHTS = [
  {
    title: 'Interac e-transfer, first-class',
    desc: 'Half your league pays by e-transfer anyway. Players choose it at registration, you mark it received, and Fieldday tracks exactly who still owes — no spreadsheet reconciliation.',
  },
  {
    title: 'GST, PST, HST — handled',
    desc: 'Set up to two tax rates (GST + PST, or a single HST), shown included in your prices or added at checkout. Every price on your site carries the right "+ HST 13%" or "incl." label automatically.',
  },
  {
    title: 'Tax remittance reports',
    desc: 'Date-ranged financial reports total the exact tax collected in the period — one line to hand your accountant at filing time, with printable reports and CSV ledgers behind it.',
  },
  {
    title: 'Your fiscal year, not the calendar’s',
    desc: 'Set your organization’s fiscal year start and every report preset — this year, last year, year over year — snaps to it.',
  },
  {
    title: 'Flat CAD pricing, no platform cut',
    desc: 'Plans are priced in Canadian dollars, and Fieldday takes no percentage of your registrations — you pay only Stripe’s standard processing fees, and e-transfer or cash payments cost nothing to record.',
  },
  {
    title: 'Cash and cheque too',
    desc: 'Gym-door cash and club cheques get recorded with the same tax breakdown as online payments, so your books stay whole no matter how people pay.',
  },
]

const FAQS = [
  {
    q: 'Can players pay their league fees by Interac e-transfer?',
    a: 'Yes. Players select e-transfer at registration and send it the way they always do; an admin marks it received in Fieldday. Outstanding balances stay visible on rosters and dashboards until then, and recorded amounts include the tax breakdown.',
  },
  {
    q: 'How does Fieldday handle GST and HST?',
    a: 'Set up to two active tax rates — a single HST, or GST plus a provincial rate like PST or QST — and choose whether prices include tax or add it at checkout. The rates apply to Stripe checkouts and offline payments alike, and financial reports total the tax collected for remittance.',
  },
  {
    q: 'Are prices really tax-inclusive if I want them to be?',
    a: 'Yes. In inclusive mode the advertised price is what players pay, and Fieldday backs the tax out for your records; in exclusive mode the tax is added and labelled at checkout. Either way, every payment record keeps the tax split.',
  },
  {
    q: 'What does Fieldday cost in Canadian dollars?',
    a: 'Plans are $0, $39, $89, and $179 CAD per month — no USD conversion surprises, no percentage taken from registrations, and paid plans include a 15-day free trial with no credit card required.',
  },
  {
    q: 'Can I get reports for my accountant or the CRA?',
    a: 'Yes. Date-ranged printable financial reports with a tax remittance line, fiscal-year presets, CSV exports of payments, expenses, and other income, and receipt attachments on expenses.',
  },
]

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((faq) => ({
    '@type': 'Question',
    name: faq.q,
    acceptedAnswer: { '@type': 'Answer', text: faq.a },
  })),
}

export default async function CanadaPage() {
  // Apex-only, like the other marketing landing pages.
  const headersList = await headers()
  if (headersList.get('x-org-id')) notFound()

  return (
    <div className="min-h-dvh bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <MarketingNav />

      {/* Hero */}
      <section className="bg-slate-950 text-white px-6 py-20 sm:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">🇨🇦 Built in Canada</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
            League management software built for Canada
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-10">
            Interac e-transfer tracking, GST/PST/HST on every charge, tax-ready reports, and flat
            CAD pricing — because your league doesn’t run on US defaults.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-900/30"
            >
              Start free trial →
            </Link>
            <Link
              href="/#pricing"
              className="w-full sm:w-auto px-8 py-3.5 border border-white/30 hover:border-white/60 text-white font-semibold rounded-xl transition-colors"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-5 text-sm text-slate-400">15-day free trial · No credit card required</p>
        </div>
      </section>

      {/* Quotable summary */}
      <section className="px-6 py-12 border-b border-gray-100">
        <p className="max-w-3xl mx-auto text-gray-600 leading-relaxed">
          Fieldday is Canadian sports league management software. It runs online registration and
          payments with Interac e-transfer and cash tracking alongside Stripe, applies GST, PST, or
          HST to every charge (tax-inclusive or added at checkout), produces date-ranged financial
          reports with a tax remittance line, and prices its plans flat in Canadian dollars with no
          platform percentage on registrations.
        </p>
      </section>

      {/* Highlights */}
      <section className="px-6 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-12">
            The parts US-built platforms leave out
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-2xl border border-gray-100 bg-white p-7 hover:shadow-md transition-shadow">
                <h3 className="text-base font-bold text-gray-900 mb-2">{h.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 sm:py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-10">
            Frequently asked questions
          </h2>
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
          <p className="text-center text-sm text-gray-400 mt-8">
            Also on Fieldday:{' '}
            {SPORT_PAGES.map((s, i) => (
              <span key={s.slug}>
                {i > 0 && ' · '}
                <Link href={`/leagues/${s.slug}`} className="text-emerald-600 hover:underline font-medium">
                  {s.sport} leagues
                </Link>
              </span>
            ))}
            {' · '}
            {COMPARISONS.map((c, i) => (
              <span key={c.slug}>
                {i > 0 && ' · '}
                <Link href={`/compare/${c.slug}`} className="text-emerald-600 hover:underline font-medium">
                  vs {c.competitor}
                </Link>
              </span>
            ))}
          </p>
        </div>
      </section>

      <ClosingCta />
      <MarketingFooter />
    </div>
  )
}
