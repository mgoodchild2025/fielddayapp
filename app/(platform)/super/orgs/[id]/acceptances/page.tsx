import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getOrgAcceptancesAdmin } from '@/actions/tenant-consent'
import { ManualAcceptanceForm } from './manual-acceptance-form'

export const dynamic = 'force-dynamic'

const DOC_LABELS: Record<string, string> = {
  'terms':          'Terms of Service',
  'tenant-privacy': 'Privacy Policy for Tenants',
  'dpa':            'Data Processing Addendum',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function OrgAcceptancesPage({ params }: Props) {
  const { id } = await params
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (db as any)
    .from('organizations')
    .select('id, name, slug')
    .eq('id', id)
    .single()

  if (!org) notFound()

  // Fetch org admin users for the manual acceptance form
  const { data: membersData } = await db
    .from('org_members')
    .select('user_id, profiles(full_name, email)')
    .eq('organization_id', id)
    .eq('role', 'org_admin')
    .eq('status', 'active')

  type MemberRow = { user_id: string; profiles: { full_name: string | null; email: string | null } | null }
  const admins = ((membersData ?? []) as unknown as MemberRow[]).map((m) => {
    const profile = m.profiles
    return {
      userId: m.user_id,
      name: profile?.full_name ?? profile?.email ?? m.user_id,
      email: profile?.email ?? null,
    }
  })

  // Fetch version list for manual acceptance form
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: versionData } = await (db as any)
    .from('legal_document_versions')
    .select(`
      id, version, published_at,
      document:legal_documents!legal_document_versions_document_id_fkey(slug, title)
    `)
    .in('document.slug' as string, ['terms', 'tenant-privacy', 'dpa'])
    .order('published_at', { ascending: false })
    .limit(50)

  type VersionRow = { id: string; version: string; published_at: string; document: { slug: string; title: string } | null }
  const versions = ((versionData ?? []) as VersionRow[]).filter((v) => v.document)

  const acceptances = await getOrgAcceptancesAdmin(id)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/super/orgs/${id}`}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← {(org as { name: string }).name}
        </Link>
        <h1 className="text-xl font-semibold text-white">Acceptance Records</h1>
      </div>

      {/* Summary by document */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {(['terms', 'tenant-privacy', 'dpa'] as const).map((slug) => {
          const latest = acceptances.find((a) => a.document_slug === slug)
          return (
            <div key={slug} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-400 mb-2">{DOC_LABELS[slug]}</p>
              {latest ? (
                <>
                  <p className="text-sm font-semibold text-white">v{latest.document_version}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(latest.accepted_at).toLocaleDateString('en-CA', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-gray-500">{latest.accepted_by_name ?? latest.accepted_by_email ?? '—'}</p>
                </>
              ) : (
                <p className="text-sm text-gray-600">No record</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Full table */}
      {acceptances.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8">
          <table className="w-full text-xs">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Document</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Version</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Accepted at</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">By</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {acceptances.map((a) => (
                <tr key={a.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-2.5 text-gray-300">{DOC_LABELS[a.document_slug] ?? a.document_slug}</td>
                  <td className="px-4 py-2.5 text-gray-400">v{a.document_version}</td>
                  <td className="px-4 py-2.5 text-gray-400">
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
                    {a.notes && <p className="text-gray-600 mt-0.5 italic">{a.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono">{a.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 bg-gray-900 border border-gray-800 rounded-xl mb-8">
          No acceptance records found for this organization.
        </div>
      )}

      {/* Manual acceptance form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-1">Record manual acceptance</h2>
        <p className="text-sm text-gray-500 mb-4">
          For tenants who signed a paper DPA or completed a procurement form outside the platform.
        </p>
        <ManualAcceptanceForm
          organizationId={id}
          admins={admins}
          versions={versions}
        />
      </div>
    </div>
  )
}
