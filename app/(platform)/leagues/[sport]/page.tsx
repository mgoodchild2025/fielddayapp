import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { MarketingNav, MarketingFooter, ClosingCta } from '@/components/marketing/marketing-page'
import { COMPARISONS, SPORT_PAGES } from '@/lib/marketing-pages'

// Marketing pages exist on the platform apex only — on org hosts they 404 so
// tenant sites never serve (or get indexed for) Fieldday's own marketing.
async function requireMarketingHost() {
  const headersList = await headers()
  if (headersList.get('x-org-id')) notFound()
}

function getPage(sport: string) {
  return SPORT_PAGES.find((s) => s.slug === sport) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params
  const page = getPage(sport)
  if (!page) return {}
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `https://fielddayapp.ca/leagues/${page.slug}` },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      // Re-declare the card image: Next's metadata merge is shallow, so this
      // openGraph object REPLACES the root layout's (image included).
      images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
    },
  }
}

export default async function SportPage({ params }: { params: Promise<{ sport: string }> }) {
  await requireMarketingHost()
  const { sport } = await params
  const page = getPage(sport)
  if (!page) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  }

  return (
    <div className="min-h-dvh bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav />

      {/* Hero */}
      <section className="bg-slate-950 text-white px-6 py-20 sm:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">{page.sport}</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">{page.h1}</h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-10">{page.heroTagline}</p>
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
        <p className="max-w-3xl mx-auto text-gray-600 leading-relaxed">{page.shortVersion}</p>
      </section>

      {/* Highlights */}
      <section className="px-6 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-12">
            Built for {page.sport.toLowerCase()} nights
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {page.highlights.map((h) => (
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
            {page.faqs.map((faq) => (
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
            {SPORT_PAGES.filter((s) => s.slug !== page.slug).map((s, i) => (
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
