import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDocument, getVersionHistory } from '@/actions/legal'
import { LegalDocumentContent } from '@/components/legal/legal-document-content'
import { VersionContentViewer } from '@/components/legal/version-content-viewer'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function VersionHistoryPage({ params }: Props) {
  const { slug } = await params
  const [doc, versions] = await Promise.all([
    getDocument(slug),
    getVersionHistory(slug),
  ])
  if (!doc) notFound()

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link
          href={`/super/legal/${slug}`}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← {doc.title}
        </Link>
        <h1 className="text-xl font-semibold text-white">Version History</h1>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-1">No versions published yet</p>
          <p className="text-sm">Publish the document to create the first version.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {versions.map((v, i) => (
            <div
              key={v.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  {i === 0 && (
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">v{v.version}</span>
                      {v.effective_date && (
                        <span className="text-sm text-gray-400">
                          · Effective {new Date(v.effective_date + 'T00:00:00').toLocaleDateString('en-CA', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span>
                        Published {new Date(v.published_at).toLocaleDateString('en-CA', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      {v.published_by_email && (
                        <span>by {v.published_by_email}</span>
                      )}
                    </div>
                    {v.notes && (
                      <p className="mt-1 text-sm text-gray-400 italic">{v.notes}</p>
                    )}
                  </div>
                </div>

                <VersionContentViewer version={v.version} content={v.content} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
