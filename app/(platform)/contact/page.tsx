import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { MarketingNav, MarketingFooter } from '@/components/marketing/marketing-page'
import {
  ORGANIZATION_SCHEMA,
  ORGANIZATION_ID,
  CONTACT_EMAILS,
  SITE_URL,
  schemaGraph,
} from '@/lib/org-schema'

export const metadata: Metadata = {
  title: 'Contact Fieldday — Sales, Support, and Privacy',
  description:
    'How to reach Fieldday: sales and demo requests, customer support for leagues already running on Fieldday, and privacy enquiries. Fieldday is operated by KABOOM SG in Ontario, Canada.',
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: 'Contact Fieldday — Sales, Support, and Privacy',
    description: 'Sales and demo requests, customer support, and privacy enquiries.',
    // Next's metadata merge is shallow: re-declare the card image.
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
}

const JSON_LD = schemaGraph([
  ORGANIZATION_SCHEMA,
  {
    '@type': 'ContactPage',
    '@id': `${SITE_URL}/contact#page`,
    url: `${SITE_URL}/contact`,
    name: 'Contact Fieldday',
    description:
      'Contact details for Fieldday: sales and demo requests, customer support, and privacy enquiries.',
    about: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-CA',
  },
])

const CHANNELS = [
  {
    heading: 'Sales and demos',
    email: CONTACT_EMAILS.general,
    subject: 'Fieldday demo',
    body: 'Questions about whether Fieldday fits your league, what a plan includes, or moving a season across from another platform. Ask for a walkthrough and we will show you the admin side with your own sport and format in mind.',
  },
  {
    heading: 'Customer support',
    email: CONTACT_EMAILS.support,
    subject: 'Fieldday support',
    body: 'For organizations already running on Fieldday: registration and payment questions, schedule or standings corrections, playoff brackets, account access, and anything that is not behaving the way it should. Include your organization name and the event in question so we can find it quickly.',
  },
  {
    heading: 'Privacy and data requests',
    email: CONTACT_EMAILS.privacy,
    subject: 'Privacy request',
    body: 'Reaches the Privacy Officer. Use it for access, correction, or deletion requests, questions about how player data is stored and shared, or anything covered in the privacy policy. Organization admins can also export or delete their own data from the admin panel.',
  },
]

export default async function ContactPage() {
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
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">Contact</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Talk to Fieldday
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed">
            Email is the fastest way to reach us. Pick the address that matches what you need and
            you will land with the right person rather than in a queue.
          </p>
        </div>
      </section>

      {/* Channels */}
      <section className="px-6 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto space-y-8">
          {CHANNELS.map((channel) => (
            <div key={channel.email} className="border border-gray-200 rounded-xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{channel.heading}</h2>
              <p className="text-gray-600 leading-relaxed mb-4">{channel.body}</p>
              <a
                href={`mailto:${channel.email}?subject=${encodeURIComponent(channel.subject)}`}
                className="inline-block font-semibold text-gray-900 underline underline-offset-4 hover:no-underline"
              >
                {channel.email}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Company details */}
      <section className="px-6 py-16 sm:py-20 bg-gray-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-6">
            Company details
          </h2>
          <dl className="space-y-4 text-gray-600 leading-relaxed">
            <div className="sm:flex sm:gap-6">
              <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">Product</dt>
              <dd>Fieldday — sports league management software for community sports organizations.</dd>
            </div>
            <div className="sm:flex sm:gap-6">
              <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">Operated by</dt>
              <dd>KABOOM SG</dd>
            </div>
            <div className="sm:flex sm:gap-6">
              <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">Location</dt>
              <dd>Ontario, Canada</dd>
            </div>
            <div className="sm:flex sm:gap-6">
              <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">General email</dt>
              <dd>
                <a
                  href={`mailto:${CONTACT_EMAILS.general}`}
                  className="text-gray-900 underline underline-offset-2 hover:no-underline"
                >
                  {CONTACT_EMAILS.general}
                </a>
              </dd>
            </div>
            <div className="sm:flex sm:gap-6">
              <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">Documentation</dt>
              <dd>
                <a
                  href="https://docs.fielddayapp.ca"
                  className="text-gray-900 underline underline-offset-2 hover:no-underline"
                >
                  docs.fielddayapp.ca
                </a>
              </dd>
            </div>
            <div className="sm:flex sm:gap-6">
              <dt className="font-semibold text-gray-900 sm:w-40 shrink-0">Policies</dt>
              <dd>
                <Link href="/legal" className="text-gray-900 underline underline-offset-2 hover:no-underline">
                  Privacy, terms, and sub-processors
                </Link>
              </dd>
            </div>
          </dl>

          <p className="mt-8 text-gray-600 leading-relaxed">
            Not ready to email? Every plan starts with a 15-day free trial that does not ask for a
            credit card, and there is a free plan for a single league of up to 50 players — the
            quickest way to answer most questions is to open an account and look around.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
            >
              Start free trial →
            </Link>
            <Link
              href="/about"
              className="px-6 py-3 border border-gray-300 hover:border-gray-500 text-gray-900 font-semibold rounded-xl transition-colors"
            >
              About Fieldday
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
