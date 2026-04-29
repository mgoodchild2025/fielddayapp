import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { startConnectOnboarding, disconnectConnectAccount } from '@/actions/stripe-connect'

export default async function PaymentSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  const { data: connectAccount } = await supabase
    .from('stripe_connect_accounts')
    .select('stripe_account_id, status, charges_enabled, payouts_enabled')
    .eq('organization_id', org.id)
    .single()

  const isConnected = !!connectAccount
  const isActive = connectAccount?.status === 'active' && connectAccount?.charges_enabled

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a href="/admin/settings" className="text-sm text-gray-500 hover:underline">← Settings</a>
        <h1 className="text-2xl font-bold mt-2">Payments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your Stripe account to accept online registration payments. Without it, players can still register and you collect payment offline.
        </p>
      </div>

      <div className="bg-white rounded-lg border p-6 space-y-5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-800">Stripe Connect</p>
            <p className="text-sm text-gray-500 mt-0.5">Online payment processing for your organization</p>
          </div>
          {!isConnected && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Not connected</span>
          )}
          {isConnected && !isActive && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Setup incomplete</span>
          )}
          {isActive && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
          )}
        </div>

        {isActive && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Charges</p>
              <p className={`font-semibold ${connectAccount.charges_enabled ? 'text-green-600' : 'text-red-500'}`}>
                {connectAccount.charges_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Payouts</p>
              <p className={`font-semibold ${connectAccount.payouts_enabled ? 'text-green-600' : 'text-yellow-600'}`}>
                {connectAccount.payouts_enabled ? 'Enabled' : 'Pending verification'}
              </p>
            </div>
          </div>
        )}

        <div className="pt-2 flex gap-3">
          {!isActive && (
            <form action={startConnectOnboarding}>
              <button
                type="submit"
                className="px-4 py-2 rounded-md text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {!isConnected ? 'Connect Stripe Account' : 'Continue Setup'}
              </button>
            </form>
          )}
          {isConnected && (
            <form action={disconnectConnectAccount}>
              <button
                type="submit"
                className="px-4 py-2 rounded-md text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50"
              >
                Disconnect
              </button>
            </form>
          )}
        </div>

        <div className="border-t pt-4 text-sm text-gray-500 space-y-1">
          <p>When connected and active:</p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Players pay via Stripe Checkout during registration</li>
            <li>Funds go directly to your Stripe account</li>
            <li>A small platform fee applies based on your plan</li>
          </ul>
          <p className="pt-1">Without a connected account, registration is still open and you manage payments manually from the <a href="/admin/payments" className="underline" style={{ color: 'var(--brand-primary)' }}>Payments</a> page.</p>
        </div>
      </div>
    </div>
  )
}
