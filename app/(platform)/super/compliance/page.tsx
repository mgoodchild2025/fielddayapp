import Link from 'next/link'
import { getPlatformComplianceOverview } from '@/actions/compliance'

export const dynamic = 'force-dynamic'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function PlatformCompliancePage() {
  const data = await getPlatformComplianceOverview()
  const { totals } = data

  const cards = [
    { label: 'Organizations', value: totals.orgs, color: 'text-white' },
    { label: 'Tracked Players', value: totals.trackedPlayers, color: 'text-white' },
    { label: 'Privacy Consents', value: totals.privacyConsents, color: 'text-emerald-400' },
    { label: 'Waiver Consents', value: totals.waiverConsents, color: 'text-emerald-400' },
    { label: 'Marketing Email', value: totals.marketingEmail, color: 'text-sky-400' },
    { label: 'Marketing SMS', value: totals.marketingSms, color: 'text-sky-400' },
    {
      label: 'Pending Reconsent',
      value: totals.pendingReconsent,
      color: totals.pendingReconsent > 0 ? 'text-amber-400' : 'text-gray-400',
    },
    { label: 'Consent Records', value: totals.consentRecords, color: 'text-white' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Consent &amp; Compliance</h1>
        <p className="text-gray-400 mt-1">
          Cross-organization view of player consent (PIPEDA) and marketing opt-ins (CASL),
          derived from the append-only consent ledger.
        </p>
      </div>

      {/* Reconsent banner */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
        {data.reconsentThreshold ? (
          <p className="text-gray-300">
            <span className="text-amber-400 font-medium">Active reconsent requirement:</span>{' '}
            Privacy Policy {data.reconsentVersion && <span className="text-gray-400">v{data.reconsentVersion}</span>}{' '}
            published {fmtDate(data.reconsentThreshold)}. Players who accepted an earlier version are
            prompted to re-accept at login.
          </p>
        ) : (
          <p className="text-gray-400">
            No active reconsent requirement. Publishing a Privacy Policy version with
            &ldquo;require reconsent&rdquo; will flag affected players here.
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{c.label}</p>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Per-org table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Organization', 'Tracked', 'Privacy', 'Waiver', 'Mkt Email', 'Mkt SMS', 'Pending Reconsent', ''].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.orgs.map((o) => (
              <tr key={o.orgId} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {o.orgName}
                  <span className="text-gray-400 text-xs font-normal ml-2">{o.slug}</span>
                </td>
                <td className="px-5 py-3 text-gray-600 text-sm">{o.trackedPlayers.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm">
                  <span className="text-emerald-700 font-medium">{o.privacyConsents.toLocaleString()}</span>
                </td>
                <td className="px-5 py-3 text-gray-600 text-sm">{o.waiverConsents.toLocaleString()}</td>
                <td className="px-5 py-3 text-sky-700 text-sm">{o.marketingEmail.toLocaleString()}</td>
                <td className="px-5 py-3 text-sky-700 text-sm">{o.marketingSms.toLocaleString()}</td>
                <td className="px-5 py-3 text-sm">
                  {o.pendingReconsent > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {o.pendingReconsent.toLocaleString()} pending
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-right">
                  <Link
                    href={`/super/orgs/${o.orgId}`}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
            {data.orgs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  No organizations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Counts reflect distinct players. Marketing figures show players currently opted in
        (latest non-withdrawn ledger entry). Privacy &amp; waiver figures count players with at least
        one accepted record.
      </p>
    </div>
  )
}
