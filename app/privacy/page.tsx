import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublishedDocument } from '@/actions/legal'
import { LegalDocumentContent } from '@/components/legal/legal-document-content'
import { CONTACT_EMAILS, SITE_URL } from '@/lib/org-schema'

export const dynamic = 'force-dynamic'

// /privacy renders the published privacy policy itself rather than redirecting
// to /legal/privacy-policy. Agents and crawlers check /privacy directly to
// verify a business is legitimate, and many do not follow the redirect — so the
// content has to be here. The canonical URL still points at the /legal copy so
// the two are never treated as competing duplicates.
export const metadata: Metadata = {
  title: 'Privacy Policy — Fieldday',
  description:
    'How Fieldday collects, uses, stores, and shares personal information for sports league registration, payments, and communications.',
  alternates: { canonical: `${SITE_URL}/legal/privacy-policy` },
}

export default async function PrivacyPage() {
  const doc = await getPublishedDocument('privacy-policy')

  const formattedUpdated = doc?.published_at
    ? new Date(doc.published_at).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null
  const formattedEffective = doc?.effective_date
    ? new Date(doc.effective_date + 'T00:00:00').toLocaleDateString('en-CA', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Fieldday
          </Link>
          <Link href="/legal" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            All policies
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8 pb-8 border-b border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">{doc?.title ?? 'Privacy Policy'}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
            {formattedEffective && <span>Effective: {formattedEffective}</span>}
            {doc?.version && <span>Version {doc.version}</span>}
            {formattedUpdated && <span>Last updated: {formattedUpdated}</span>}
          </div>
        </div>

        {doc ? (
          <LegalDocumentContent content={doc.content} />
        ) : (
          // Nothing published yet — still answer with real, useful content
          // rather than a bare placeholder, so the page is never empty.
          <div className="space-y-4 text-gray-600 leading-relaxed">
            <p>
              Fieldday is sports league management software operated by KABOOM SG in Ontario,
              Canada. It collects the personal information a league needs to register players and
              run its season: name, email address, phone number where the league requires it, the
              league and team being joined, and communication preferences.
            </p>
            <p>
              That information is used to register players, operate the league, and communicate
              about games and payments. Payment card details are handled by Stripe and are never
              stored by Fieldday. Each organization sees only its own members&apos; information.
            </p>
            <p>
              The full policy, along with the terms of service and the list of sub-processors, is
              published at{' '}
              <Link href="/legal" className="text-gray-900 underline underline-offset-2 hover:no-underline">
                fielddayapp.ca/legal
              </Link>
              . Access, correction, and deletion requests go to the Privacy Officer at{' '}
              <a
                href={`mailto:${CONTACT_EMAILS.privacy}`}
                className="text-gray-900 underline underline-offset-2 hover:no-underline"
              >
                {CONTACT_EMAILS.privacy}
              </a>
              , and organization admins can export or delete their own data from the admin panel.
            </p>
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-gray-100 text-sm text-gray-500">
          Privacy questions:{' '}
          <a
            href={`mailto:${CONTACT_EMAILS.privacy}`}
            className="text-gray-900 underline underline-offset-2 hover:no-underline"
          >
            {CONTACT_EMAILS.privacy}
          </a>
        </div>
      </main>
    </div>
  )
}
