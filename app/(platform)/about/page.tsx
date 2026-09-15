import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { MarketingNav, MarketingFooter, ClosingCta } from '@/components/marketing/marketing-page'
import {
  ORGANIZATION_SCHEMA,
  ORGANIZATION_ID,
  CONTACT_EMAILS,
  SITE_URL,
  schemaGraph,
} from '@/lib/org-schema'

export const metadata: Metadata = {
  title: 'About Fieldday — Canadian Sports League Management Software',
  description:
    'Fieldday is sports league management software for community sports organizations in Canada. Learn who builds it, what it does, how it is priced, and how to reach us.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'About Fieldday — Canadian Sports League Management Software',
    description:
      'Who builds Fieldday, what the software does for community sports leagues, and how it is priced.',
    // Next's metadata merge is shallow: re-declare the card image.
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
}

const JSON_LD = schemaGraph([
  ORGANIZATION_SCHEMA,
  {
    '@type': 'AboutPage',
    '@id': `${SITE_URL}/about#page`,
    url: `${SITE_URL}/about`,
    name: 'About Fieldday',
    description:
      'Fieldday is sports league management software for community sports organizations in Canada.',
    about: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-CA',
  },
])

const WHAT_IT_DOES = [
  {
    title: 'Registration and payments',
    body: 'Players register online and pay by card through Stripe, by Interac e-transfer, or in cash at the door. Every method is recorded the same way, with GST, PST, or HST applied and tracked, so the books balance no matter how someone paid.',
  },
  {
    title: 'Scheduling and standings',
    body: 'Build a season schedule, record scores from the admin panel or from a captain’s phone, and publish live standings and statistics that update as results come in.',
  },
  {
    title: 'Playoffs and brackets',
    body: 'Generate single or double elimination brackets, run multiple tiers with cross-tier drop-downs, or hand-build a bracket seat by seat. Medals are awarded at the end and kept in a permanent Hall of Champions.',
  },
  {
    title: 'A website for every league',
    body: 'Each organization gets its own branded site with schedules, standings, photo galleries, player cards, and gym TV displays, all under its own colours and logo.',
  },
  {
    title: 'Financial tools',
    body: 'Track expenses, overhead, and other income against registration revenue, attach receipts, and produce date-ranged financial reports with a tax remittance line and CSV ledgers.',
  },
  {
    title: 'A free scoreboard',
    body: 'The Fieldday scoreboard is a free app that works on any phone, with or without a Fieldday account. Leagues on Fieldday can attach it to a scheduled game so the final score saves straight to the standings.',
  },
]

export default async function AboutPage() {
  // Apex-only, like the other marketing pages.
  const headersList = await headers()
  if (headersList.get('x-org-id')) notFound()

  return (
    <div className="min-h-dvh bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <MarketingNav />

      {/* Hero */}
      <section className="bg-slate-950 text-white px-6 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">About us</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Software for the people who run the league
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed">
            Fieldday is sports league management software for community sports organizations in
            Canada — one place for registration, payments, schedules, standings, playoffs, and the
            league’s own public website.
          </p>
        </div>
      </section>

      {/* Quotable summary */}
      <section className="px-6 py-12 border-b border-gray-100">
        <div className="max-w-3xl mx-auto space-y-4 text-gray-600 leading-relaxed">
          <p>
            Most league software was built for teams — rosters, carpools, and parent chat — or for
            large organizations that buy through a sales call. Fieldday is built for the person who
            runs the whole league: the volunteer or small-staff operator who opens registration,
            chases the payments, builds the schedule, settles the standings, and runs the playoffs.
          </p>
          <p>
            That focus shapes the product. Registration, payments, scheduling, scoring, playoffs,
            medals, financial reporting, and a public league website are one system rather than
            several subscriptions stitched together, and the parts Canadian operators actually need
            are first-class: Interac e-transfer and cash alongside card payments, GST, PST, and HST
            handled on every charge, and plans priced flat in Canadian dollars with no percentage
            taken from registrations.
          </p>
        </div>
      </section>

      {/* What it does */}
      <section className="px-6 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-12">
            What Fieldday does
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHAT_IT_DOES.map((item) => (
              <div key={item.title} className="border border-gray-200 rounded-xl p-6">
                <h3 className="text-base font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who we are */}
      <section className="px-6 py-16 sm:py-20 bg-gray-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-6">
            Who builds Fieldday
          </h2>
          <div className="space-y-4 text-gray-600 leading-relaxed">
            <p>
              Fieldday is operated by KABOOM SG, located in Ontario, Canada. It is a small
              independent software company, not a division of a larger platform, and Fieldday is the
              product it works on.
            </p>
            <p>
              The software is developed and supported directly by the people who build it, which is
              why the pricing is public and self-serve: every plan is listed on the pricing page and
              starts with a 15-day free trial that does not ask for a credit card. There is also a
              free plan for a single league of up to 50 players, and the scoreboard app is free for
              anyone to use.
            </p>
            <p>
              Questions about how data is handled are answered in the{' '}
              <Link href="/legal" className="text-gray-900 underline underline-offset-2 hover:no-underline">
                published policies
              </Link>
              , which cover privacy, terms of service, and the sub-processors Fieldday relies on.
              Privacy questions go to{' '}
              <a
                href={`mailto:${CONTACT_EMAILS.privacy}`}
                className="text-gray-900 underline underline-offset-2 hover:no-underline"
              >
                {CONTACT_EMAILS.privacy}
              </a>
              .
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors"
            >
              Contact us
            </Link>
            <Link
              href="/canada"
              className="px-6 py-3 border border-gray-300 hover:border-gray-500 text-gray-900 font-semibold rounded-xl transition-colors"
            >
              Built for Canada
            </Link>
          </div>
        </div>
      </section>

      <ClosingCta />
      <MarketingFooter />
    </div>
  )
}
