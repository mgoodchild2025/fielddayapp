import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { StripeKeyForm } from '@/components/payments/stripe-key-form'
import { StripeSetupGuide } from '@/components/payments/stripe-setup-guide'

export default async function PaymentSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  const { data: settings } = await db
    .from('org_payment_settings')
    .select('stripe_secret_key, stripe_webhook_secret')
    .eq('organization_id', org.id)
    .single()

  const hasSecretKey = !!settings?.stripe_secret_key
  const hasWebhookSecret = !!settings?.stripe_webhook_secret
  // Detect test vs live from the key prefix — only reveal the mode, not the key itself
  const isTestMode = settings?.stripe_secret_key
    ? settings.stripe_secret_key.startsWith('sk_test_')
    : null

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <a href="/admin/settings" className="text-sm text-gray-500 hover:underline">← Settings</a>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold">Payments</h1>
            <p className="text-sm text-gray-500 mt-1">
              Connect your own Stripe account to accept online registration payments.
              Without it, players can still register and you collect payment offline.
            </p>
          </div>
          <div className="shrink-0 mt-1">
            <StripeSetupGuide orgSlug={org.slug} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <StripeKeyForm
          orgSlug={org.slug}
          hasSecretKey={hasSecretKey}
          hasWebhookSecret={hasWebhookSecret}
          isTestMode={isTestMode}
        />
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Don&apos;t have a Stripe account?{' '}
        <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener noreferrer" className="underline">
          Create one free at stripe.com
        </a>. No monthly fees — Stripe charges a small per-transaction fee.
      </div>
    </div>
  )
}
