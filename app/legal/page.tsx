import Link from 'next/link'
import { listPublishedDocuments } from '@/actions/legal'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Legal & Policies — Fieldday',
  description: 'Fieldday privacy policy, terms of service, and other legal documents.',
}

export default async function LegalIndexPage() {
  const docs = await listPublishedDocuments()

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Fieldday
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Legal & Policies</h1>
        <p className="text-gray-500 mb-10">
          Fieldday&apos;s legal documents, policies, and compliance resources.
        </p>

        {docs.length === 0 ? (
          <p className="text-gray-400">No published documents yet.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/legal/${doc.slug}`}
                className="block p-5 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">{doc.title}</h2>
                    {doc.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{doc.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {doc.version && (
                      <span className="text-xs text-gray-400">v{doc.version}</span>
                    )}
                    {doc.effective_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Effective {new Date(doc.effective_date + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
