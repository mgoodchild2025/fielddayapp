import { searchAcceptances } from '@/actions/tenant-consent'
import { AcceptanceSearchForm } from './search-form'

export const dynamic = 'force-dynamic'

const DOC_LABELS: Record<string, string> = {
  'terms':          'Terms of Service',
  'tenant-privacy': 'Privacy Policy for Tenants',
  'dpa':            'Data Processing Addendum',
}

interface Props {
  searchParams: Promise<{
    email?: string
    slug?: string
    from?: string
    to?: string
  }>
}

export default async function AcceptanceSearchPage({ searchParams }: Props) {
  const { email, slug, from, to } = await searchParams

  const hasFilters = email || slug || from || to
  const results = hasFilters
    ? await searchAcceptances({
        userEmail: email,
        documentSlug: slug,
        fromDate: from,
        toDate: to,
      })
    : []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Acceptance Search</h1>
        <p className="text-gray-400 mt-1">Search tenant acceptance records across all organizations.</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
        <AcceptanceSearchForm
          initialEmail={email ?? ''}
          initialSlug={slug ?? ''}
          initialFrom={from ?? ''}
          initialTo={to ?? ''}
        />
      </div>

      {hasFilters && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>

          {results.length > 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">Organization</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">Document</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">Version</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">Accepted</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">By</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {results.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-2.5">
                        <div className="text-gray-300 font-medium">
                          {(a as unknown as { org?: { name: string; slug: string } | null }).org?.name ?? a.organization_id.slice(0, 8)}
                        </div>
                        <div className="text-gray-600">
                          {(a as unknown as { org?: { name: string; slug: string } | null }).org?.slug}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{DOC_LABELS[a.document_slug] ?? a.document_slug}</td>
                      <td className="px-4 py-2.5 text-gray-500">v{a.document_version}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {new Date(a.accepted_at).toLocaleString('en-CA', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">
                        <div>{a.accepted_by_name ?? '—'}</div>
                        <div className="text-gray-600">{a.accepted_by_email ?? ''}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.acceptance_type === 'manual'
                            ? 'bg-purple-900/50 text-purple-300'
                            : a.acceptance_type === 'reacceptance'
                            ? 'bg-blue-900/50 text-blue-300'
                            : 'bg-emerald-900/50 text-emerald-300'
                        }`}>
                          {a.acceptance_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono">{a.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 bg-gray-900 border border-gray-800 rounded-xl">
              No acceptance records match your search.
            </div>
          )}
        </>
      )}
    </div>
  )
}
