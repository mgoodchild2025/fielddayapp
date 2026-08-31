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

function getPage(slug: string) {
  return COMPARISONS.find((c) => c.slug === slug) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = getPage(slug)
  if (!page) return {}
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `https://fielddayapp.ca/compare/${page.slug}` },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      // Re-declare the card image: Next's metadata merge is shallow, so this
      // openGraph object REPLACES the root layout's (image included).
      images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
    },
  }
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireMarketingHost()
  const { slug } = await params
  const page = getPage(slug)
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
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">Comparison</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Fieldday <span className="text-slate-500">vs</span> {page.competitor}
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed">{page.heroTagline}</p>
        </div>
      </section>

      {/* Quotable summary */}
      <section className="px-6 py-12 border-b border-gray-100">
        <p className="max-w-3xl mx-auto text-gray-600 leading-relaxed">{page.shortVersion}</p>
      </section>

      {/* Choose lists */}
      <section className="px-6 py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border-2 border-emerald-500 bg-white p-7">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Choose Fieldday if…</h2>
            <ul className="space-y-3">
              {page.chooseFieldday.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
                  <svg className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-7">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Choose {page.competitor} if…</h2>
            <ul className="space-y-3">
              {page.chooseThem.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600 leading-relaxed">
                  <svg className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight text-center mb-10">
            How they differ
          </h2>
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3.5 font-bold text-gray-400 text-[11px] uppercase tracking-widest w-1/4">Dimension</th>
                    <th className="text-left px-5 py-3.5 font-bold text-emerald-700 bg-emerald-50/60">Fieldday</th>
                    <th className="text-left px-5 py-3.5 font-bold text-gray-900">{page.competitor}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.dim} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-4 font-semibold text-gray-700 align-top">{row.dim}</td>
                      <td className="px-5 py-4 text-gray-600 leading-relaxed align-top bg-emerald-50/40">{row.fieldday}</td>
                      <td className="px-5 py-4 text-gray-600 leading-relaxed align-top">{row.them}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">
            {page.competitor} details reflect publicly available information as of August 2026 and may change — verify
            current pricing and features with {page.competitor} directly.
          </p>
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
            More comparisons:{' '}
            {COMPARISONS.filter((c) => c.slug !== page.slug).map((c, i) => (
              <span key={c.slug}>
                {i > 0 && ' · '}
                <Link href={`/compare/${c.slug}`} className="text-emerald-600 hover:underline font-medium">
                  vs {c.competitor}
                </Link>
              </span>
            ))}
            {' · '}
            {SPORT_PAGES.map((s, i) => (
              <span key={s.slug}>
                {i > 0 && ' · '}
                <Link href={`/leagues/${s.slug}`} className="text-emerald-600 hover:underline font-medium">
                  {s.sport}
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
