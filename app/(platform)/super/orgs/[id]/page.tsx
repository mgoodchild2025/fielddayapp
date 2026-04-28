import { createServiceRoleClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EditOrgForm } from './edit-org-form'
import { ImpersonateButton } from './impersonate-button'
import { SetOrgAdminForm } from './set-org-admin-form'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  trialing: 'bg-yellow-100 text-yellow-800',
  past_due: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-600',
  paused: 'bg-gray-100 text-gray-600',
}

const LEAGUE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-500',
}

export default async function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServiceRoleClient()

  const [orgRes, membersRes, leaguesRes, paymentsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('*, subscriptions(*), org_branding(custom_domain, logo_url)')
      .eq('id', id)
      .single(),
    supabase
      .from('org_members')
      .select('id, role, status, joined_at, profiles(full_name, email)')
      .eq('organization_id', id)
      .order('joined_at', { ascending: false }),
    supabase
      .from('leagues')
      .select('id, name, slug, sport, status, created_at')
      .eq('organization_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('amount_cents, status, currency')
      .eq('organization_id', id)
      .eq('status', 'paid'),
  ])

  const org = orgRes.data
  if (!org) notFound()

  const sub = Array.isArray(org.subscriptions) ? org.subscriptions[0] : org.subscriptions
  const branding = Array.isArray(org.org_branding) ? org.org_branding[0] : org.org_branding
  const members = membersRes.data ?? []
  const leagues = leaguesRes.data ?? []
  const payments = paymentsRes.data ?? []

  const totalRevenueCents = payments.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0)
  const adminCount = members.filter(m => m.role === 'org_admin').length
  const currentAdmins = members
    .filter(m => m.role === 'org_admin')
    .map(m => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return { name: profile?.full_name ?? null, email: profile?.email ?? null }
    })
  const playerCount = members.filter(m => m.role === 'player').length

  const siteUrl = branding?.custom_domain
    ? `https://${branding.custom_domain}`
    : `http://${org.slug}.localhost:3000`

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/super" className="text-sm text-gray-400 hover:text-white mb-3 inline-block">
          ← All Organizations
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{org.name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {org.slug}.fielddayapp.ca
              {branding?.custom_domain && <span className="ml-2">· {branding.custom_domain}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[org.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {org.status}
            </span>
            <ImpersonateButton orgId={org.id} />
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md"
            >
              Visit Site ↗
            </a>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Members', value: members.length },
          { label: 'Admins', value: adminCount },
          { label: 'Leagues', value: leagues.length },
          { label: 'Revenue', value: `$${(totalRevenueCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}` },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col: edit forms */}
        <div className="lg:col-span-2 space-y-6">
          <EditOrgForm
            org={{
              id: org.id,
              name: org.name,
              slug: org.slug,
              sport: org.sport,
              city: org.city ?? null,
              status: org.status,
            }}
            subscription={sub ? {
              plan_tier: sub.plan_tier,
              status: sub.status,
              trial_end: sub.trial_end ?? null,
              current_period_end: sub.current_period_end ?? null,
            } : null}
          />
          <SetOrgAdminForm orgId={org.id} currentAdmins={currentAdmins} />
        </div>

        {/* Right col: members + leagues */}
        <div className="space-y-6">
          {/* Members */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-3">Members <span className="text-gray-400 font-normal text-sm">({members.length})</span></h2>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {members.length === 0 && <p className="text-sm text-gray-400">No members yet.</p>}
              {members.map(m => {
                const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
                return (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{profile?.full_name ?? '—'}</p>
                      <p className="text-gray-400 text-xs truncate">{profile?.email}</p>
                    </div>
                    <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      m.role === 'org_admin' ? 'bg-purple-100 text-purple-700' :
                      m.role === 'league_admin' ? 'bg-blue-100 text-blue-700' :
                      m.role === 'captain' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {m.role.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leagues */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold mb-3">Leagues <span className="text-gray-400 font-normal text-sm">({leagues.length})</span></h2>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {leagues.length === 0 && <p className="text-sm text-gray-400">No leagues yet.</p>}
              {leagues.map(l => (
                <div key={l.id} className="flex items-center justify-between text-sm">
                  <p className="font-medium truncate">{l.name}</p>
                  <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${LEAGUE_STATUS_STYLES[l.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {l.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-white rounded-lg border border-red-100 p-5">
            <h2 className="font-semibold text-red-700 mb-3">Danger Zone</h2>
            <div className="space-y-2">
              <SuspendButton orgId={org.id} currentStatus={org.status} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Inline server-renderable suspend button (needs client for interaction)
import { SuspendOrgButton } from './suspend-org-button'

function SuspendButton({ orgId, currentStatus }: { orgId: string; currentStatus: string }) {
  return <SuspendOrgButton orgId={orgId} currentStatus={currentStatus} />
}
