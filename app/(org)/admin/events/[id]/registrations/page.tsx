import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getAdminScope } from '@/lib/admin-scope'
import { activateRegistration } from '@/actions/registrations'
import { RemoveRegistrationButton } from '@/components/registrations/remove-registration-button'
import { SendWaiverRemindersButton } from '@/components/registrations/send-waiver-reminders-button'
import { CopyWaiverLink } from '@/components/waivers/copy-waiver-link'

const regStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  waitlisted: 'bg-orange-100 text-orange-700',
}

const paymentStatusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
  manual: 'bg-blue-100 text-blue-700',
}

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  const scope = await getAdminScope(org.id)
  const isOrgAdmin = scope.isOrgAdmin

  const [{ data: branding }, { data: league }, { data: activeWaiver }] = await Promise.all([
    db.from('org_branding').select('timezone').eq('organization_id', org.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('leagues').select('name, slug, waiver_version_id').eq('id', id).eq('organization_id', org.id).single(),
    db.from('waivers').select('id').eq('organization_id', org.id).eq('is_active', true).maybeSingle(),
  ])
  const timezone = branding?.timezone ?? 'America/Toronto'
  const leagueSlug = (league as { slug?: string } | null)?.slug ?? ''
  const hasWaiverConfigured = !!(league as { waiver_version_id?: string | null } | null)?.waiver_version_id || !!activeWaiver

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registrations } = await (db as any)
    .from('registrations')
    .select(`
      id, status, created_at, user_id, waiver_signature_id, checked_in_at,
      registration_type,
      user_profile:profiles!registrations_user_id_fkey(full_name, email),
      payments(status, amount_cents, currency, payment_method)
    `)
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  const rows = registrations ?? []

  // Fetch session dates separately — only works after migration 095 has been applied.
  // Gracefully degrades: if session_id column doesn't exist yet, sessionMap is empty.
  let sessionMap = new Map<string, string>()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionRows } = await (db as any)
      .from('registrations')
      .select('id, session_id, session:event_sessions(scheduled_at)')
      .in('id', rows.map((r: { id: string }) => r.id))
      .not('session_id', 'is', null)
    for (const r of (sessionRows ?? [])) {
      const s = Array.isArray(r.session) ? r.session[0] : r.session
      if (s?.scheduled_at) sessionMap.set(r.id, s.scheduled_at)
    }
  } catch {
    // migration not yet applied — session info simply won't show
  }
  const unsignedCount = rows.filter((r: { status: string; waiver_signature_id: string | null }) => r.status === 'active' && !r.waiver_signature_id).length
  // Show reminders button whenever the org has ANY waiver configured (league-level or org-level active waiver)
  const hasWaiver = hasWaiverConfigured

  // Build the public waiver signing URL from request headers
  const host = headersList.get('host') ?? ''
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  const waiverUrl = leagueSlug ? `${proto}://${host}/events/${leagueSlug}/waiver` : ''

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {rows.length} registration{rows.length !== 1 ? 's' : ''}
        {' · '}
        {rows.filter((r: { status: string }) => r.status === 'active').length} active
      </p>

      {/* Waiver link — shown whenever org has a waiver configured */}
      {hasWaiverConfigured && waiverUrl && (
        <div className="mb-4">
          <CopyWaiverLink url={waiverUrl} />
        </div>
      )}

      <div className="mb-4">
        <SendWaiverRemindersButton
          leagueId={id}
          unsignedCount={unsignedCount}
          hasWaiver={hasWaiver}
        />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Player</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Payment</th>
              <th className="px-4 py-3 font-medium text-gray-500">Waiver</th>
              <th className="px-4 py-3 font-medium text-gray-500">Check-in</th>
              <th className="px-4 py-3 font-medium text-gray-500">Registered</th>
              {isOrgAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((reg: any) => {
              const profile = Array.isArray(reg.user_profile)
                ? reg.user_profile[0]
                : reg.user_profile
              const payment = Array.isArray(reg.payments) ? reg.payments[0] : reg.payments

              async function approveAction() {
                'use server'
                await activateRegistration(reg.id)
              }

              const isDropIn = reg.registration_type === 'drop_in'
              const sessionAt = sessionMap.get(reg.id) ?? null
              const sessionDate = sessionAt
                ? new Date(sessionAt).toLocaleString('en-CA', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                    timeZone: timezone,
                  })
                : null

              return (
                <tr key={reg.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{profile?.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-400">{profile?.email ?? '—'}</div>
                    {isDropIn && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                          Drop-in
                        </span>
                        {sessionDate && (
                          <span className="text-[10px] text-gray-400">{sessionDate}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        regStatusColors[reg.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {reg.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {payment ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          paymentStatusColors[payment.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {payment.status === 'paid' || payment.status === 'manual'
                          ? `$${(payment.amount_cents / 100).toFixed(0)} ${payment.currency.toUpperCase()} · ${payment.payment_method}`
                          : payment.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">free</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {reg.waiver_signature_id ? (
                      <Link
                        href={`/admin/settings/waivers/signatures/${reg.waiver_signature_id}`}
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                      >
                        ✓ Signed
                      </Link>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(reg as any).checked_in_at ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        ✓ {new Date((reg as any).checked_in_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(reg.created_at).toLocaleDateString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: timezone,
                    })}
                  </td>
                  {isOrgAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {reg.status === 'pending' && (
                          <form action={approveAction}>
                            <button
                              type="submit"
                              className="text-xs font-medium hover:underline"
                              style={{ color: 'var(--brand-primary)' }}
                            >
                              Approve
                            </button>
                          </form>
                        )}
                        <RemoveRegistrationButton
                          registrationId={reg.id}
                          leagueId={id}
                          playerName={profile?.full_name ?? 'this player'}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isOrgAdmin ? 7 : 6} className="px-4 py-12 text-center text-gray-400">
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
