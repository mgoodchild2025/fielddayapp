import Link from 'next/link'
import { listAllDocuments } from '@/actions/legal'

export default async function PlatformLegalPage() {
  const docs = await listAllDocuments()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Legal Documents</h1>
        <p className="text-gray-400 mt-1">Manage Fieldday&apos;s public legal documents and policies.</p>
      </div>

      <div className="space-y-3">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/super/legal/${doc.slug}`}
            className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition-colors group"
          >
            <div className="flex items-center gap-4">
              {/* Status dot */}
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${doc.is_published ? 'bg-emerald-500' : 'bg-gray-600'}`} />
              <div>
                <h2 className="font-medium text-white group-hover:text-gray-100">
                  {doc.title}
                </h2>
                {doc.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{doc.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {doc.is_published ? (
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Published
                  </span>
                  <div className="flex gap-2 text-xs text-gray-500 mt-1 justify-end">
                    {doc.version && <span>v{doc.version}</span>}
                    {doc.effective_date && (
                      <span>Effective {new Date(doc.effective_date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="inline-flex items-center text-xs font-medium text-gray-500 bg-gray-800 px-2.5 py-1 rounded-full">
                  Draft
                </span>
              )}
              <span className="text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Link to public index */}
      <div className="mt-8 pt-6 border-t border-gray-800">
        <Link
          href="/legal"
          target="_blank"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          View public legal page ↗
        </Link>
      </div>
    </div>
  )
}
