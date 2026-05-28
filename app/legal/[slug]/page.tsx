import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublishedDocument, listPublishedDocuments } from '@/actions/legal'
import { LegalDocumentContent } from '@/components/legal/legal-document-content'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getPublishedDocument(slug)
  if (!doc) return { title: 'Not Found' }
  return {
    title: `${doc.title} — Fieldday`,
    description: doc.description ?? undefined,
  }
}

export default async function LegalDocumentPage({ params }: Props) {
  const { slug } = await params
  const doc = await getPublishedDocument(slug)
  if (!doc) notFound()

  const formattedDate = doc.effective_date
    ? new Date(doc.effective_date + 'T00:00:00').toLocaleDateString('en-CA', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  const formattedUpdated = new Date(doc.published_at!).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-white">
      {/* Simple header */}
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
        {/* Document meta */}
        <div className="mb-8 pb-8 border-b border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">{doc.title}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
            {formattedDate && (
              <span>Effective: {formattedDate}</span>
            )}
            {doc.version && (
              <span>Version {doc.version}</span>
            )}
            <span>Last updated: {formattedUpdated}</span>
          </div>
          {doc.description && (
            <p className="mt-3 text-gray-600">{doc.description}</p>
          )}
        </div>

        {/* Document content */}
        <LegalDocumentContent content={doc.published_content ?? doc.content} />

        {/* Footer nav */}
        <div className="mt-16 pt-8 border-t border-gray-100">
          <Link
            href="/legal"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back to all policies
          </Link>
        </div>
      </main>
    </div>
  )
}

export async function generateStaticParams() {
  const docs = await listPublishedDocuments()
  return docs.map((d) => ({ slug: d.slug }))
}
