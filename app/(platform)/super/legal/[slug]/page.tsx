import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDocument, unpublishDocument } from '@/actions/legal'
import { LegalEditor } from '@/components/legal/legal-editor'
import { UnpublishButton } from '@/components/legal/unpublish-button'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PlatformLegalEditorPage({ params }: Props) {
  const { slug } = await params
  const doc = await getDocument(slug)
  if (!doc) notFound()

  const formattedUpdated = new Date(doc.updated_at).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] -mx-6 -my-8">
      {/* Editor header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/super/legal"
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            ← Legal docs
          </Link>
          <div>
            <h1 className="font-semibold text-white">{doc.title}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {doc.is_published ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Published {doc.version ? `· v${doc.version}` : ''}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  Draft
                </span>
              )}
              <span className="text-xs text-gray-600">Last saved {formattedUpdated}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {doc.is_published && (
            <Link
              href={`/legal/${slug}`}
              target="_blank"
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              View live ↗
            </Link>
          )}
          <Link
            href={`/super/legal/${slug}/history`}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Version history
          </Link>
          {doc.is_published && (
            <UnpublishButton slug={slug} />
          )}
        </div>
      </div>

      {/* Editor (full height remaining) */}
      <div className="flex-1 overflow-hidden">
        <LegalEditor doc={doc} />
      </div>
    </div>
  )
}
