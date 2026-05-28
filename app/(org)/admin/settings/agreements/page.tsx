import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { getOrgAcceptances, getPendingReacceptance, TENANT_CONSENT_SLUGS } from '@/actions/tenant-consent'

export const dynamic = 'force-dynamic'

const DOC_LABELS: Record<string, string> = {
  'terms':          'Terms of Service',
  'tenant-privacy': 'Privacy Policy for Tenants',
  'dpa':            'Data Processing Addendum',
}

export default async function AgreementsSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [acceptances, pending] = await Promise.all([
    getOrgAcceptances(org.id),
    getPendingReacceptance(org.id),
  ])

  // Most recent acceptance per slug
  const latestBySlug = new Map<string, typeof acceptances[0]>()
  for (const a of acceptances) {
    if (!latestBySlug.has(a.document_slug)) {
      latestBySlug.set(a.document_slug, a)
    }
  }

  const pendingSlugs = new Set(pending.map((d) => d.slug))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Legal Agreements</h1>
        <p className="text-sm text-gray-500 mt-1">
          The Fieldday agreements your organization has accepted.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Updated agreements require acceptance</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {pending.map((d) => d.title).join(', ')} {pending.length > 1 ? 'have' : 'has'} been updated.
            </p>
            <Link
              href="/admin/reaccept"
              className="mt-2 inline-block text-xs font-semibold text-amber-800 underline hover:text-amber-900"
            >
              Accept updated agreements →
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {TENANT_CONSENT_SLUGS.map((slug) => {
          const latest = latestBySlug.get(slug)
          const needsUpdate = pendingSlugs.has(slug)

          return (
            <div
              key={slug}
              className={`bg-white border rounded-xl p-5 ${
                needsUpdate ? 'border-amber-300' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 text-sm">{DOC_LABELS[slug] ?? slug}</h2>
                    {needsUpdate && (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Update required
                      </span>
                    )}
                  </div>

                  {latest ? (
                    <div className="mt-1.5 text-xs text-gray-500 space-y-0.5">
                      <p>
                        <span className="text-gray-700 font-medium">Version {latest.document_version}</span>
                        {' '}accepted on{' '}
                        {new Date(latest.accepted_at).toLocaleDateString('en-CA', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </p>
                      <p>
                        Accepted by {latest.accepted_by_name ?? latest.accepted_by_email ?? 'Unknown'}{' '}
                        · {latest.acceptance_type === 'manual' ? 'Manual record' : latest.acceptance_type === 'reacceptance' ? 'Re-accepted' : 'During signup'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-gray-400">No acceptance on record</p>
                  )}
                </div>

                <Link
                  href={`/legal/${slug}`}
                  target="_blank"
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  View current ↗
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* Full history */}
      {acceptances.length > TENANT_CONSENT_SLUGS.length && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Full acceptance history</h2>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Document</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Version</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Accepted</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600">By</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {acceptances.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700">{DOC_LABELS[a.document_slug] ?? a.document_slug}</td>
                    <td className="px-4 py-2.5 text-gray-500">v{a.document_version}</td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {new Date(a.accepted_at).toLocaleDateString('en-CA', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{a.accepted_by_name ?? a.accepted_by_email ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.acceptance_type === 'manual'
                          ? 'bg-purple-50 text-purple-700'
                          : a.acceptance_type === 'reacceptance'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {a.acceptance_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
