import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { activateRegistration } from '@/actions/registrations'
import { RemoveRegistrationButton } from '@/components/registrations/remove-registration-button'

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
  const supabase = await createServerClient()

  const { data: registrations } = await supabase
    .from('registrations')
    .select(`
      id, status, created_at, user_id, waiver_signature_id,
      user_profile:profiles!registrations_user_id_fkey(full_name, email),
      payments(status, amount_cents, currency, payment_method)
    `)
    .eq('league_id', id)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  const rows = registrations ?? []

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {rows.length} registration{rows.length !== 1 ? 's' : ''}
        {' · '}
        {rows.filter((r) => r.status === 'active').length} active
      </p>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Player</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Payment</th>
              <th className="px-4 py-3 font-medium text-gray-500">Waiver</th>
              <th className="px-4 py-3 font-medium text-gray-500">Registered</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((reg) => {
              const profile = Array.isArray(reg.user_profile)
                ? reg.user_profile[0]
                : reg.user_profile
              const payment = Array.isArray(reg.payments) ? reg.payments[0] : reg.payments

              async function approveAction() {
                'use server'
                await activateRegistration(reg.id)
              }

              return (
                <tr key={reg.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{profile?.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-400">{profile?.email ?? '—'}</div>
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
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Signed
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(reg.created_at).toLocaleDateString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
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
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
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
