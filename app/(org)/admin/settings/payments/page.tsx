import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { StripeKeyForm } from '@/components/payments/stripe-key-form'
import { StripeSetupGuide } from '@/components/payments/stripe-setup-guide'
import { RegistrationPaymentForm } from '@/components/payments/registration-payment-form'
import { ShopPaymentForm } from '@/components/payments/shop-payment-form'
import { HelpLink } from '@/components/ui/help-link'

export default async function PaymentSettingsPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (db as any)
    .from('org_payment_settings')
    .select('stripe_secret_key, stripe_webhook_secret, shop_payment_mode, manual_payment_instructions, registration_payment_mode, registration_manual_instructions')
    .eq('organization_id', org.id)
    .maybeSingle() as { data: {
      stripe_secret_key: string | null
      stripe_webhook_secret: string | null
      shop_payment_mode: string | null
      manual_payment_instructions: string | null
      registration_payment_mode: string | null
      registration_manual_instructions: string | null
    } | null }

  const hasSecretKey = !!settings?.stripe_secret_key
  const hasWebhookSecret = !!settings?.stripe_webhook_secret
  // Detect test vs live from the key prefix — only reveal the mode, not the key itself
  const isTestMode = settings?.stripe_secret_key
    ? settings.stripe_secret_key.startsWith('sk_test_')
    : null

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Payments</h1>
            <p className="text-sm text-gray-500 mt-1">
              Connect your own Stripe account to accept online registration payments.
              Without it, players can still register and you collect payment offline.
            </p>
            <div className="mt-2">
              <HelpLink href="https://docs.fielddayapp.ca/org-admins/connect-stripe" label="How to connect Stripe" />
            </div>
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

      {/* Registration payment method */}
      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Registration payment method</h2>
          <p className="text-sm text-gray-500 mt-1">
            Choose how players pay when registering for a league or event.
            Online payment requires Stripe to be connected above.
          </p>
        </div>
        <div className="bg-white rounded-lg border p-6">
          <RegistrationPaymentForm
            mode={(settings?.registration_payment_mode as 'stripe' | 'manual' | 'both') ?? (hasSecretKey ? 'stripe' : 'manual')}
            instructions={settings?.registration_manual_instructions ?? null}
          />
        </div>
      </div>

      {/* Shop payment method */}
      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Shop payment method</h2>
          <p className="text-sm text-gray-500 mt-1">
            Choose how players pay when purchasing items from your shop.
            Online payment requires Stripe to be connected above.
          </p>
        </div>
        <div className="bg-white rounded-lg border p-6">
          <ShopPaymentForm
            mode={(settings?.shop_payment_mode as 'stripe' | 'manual') ?? (hasSecretKey ? 'stripe' : 'manual')}
            instructions={settings?.manual_payment_instructions ?? null}
          />
        </div>
      </div>
    </div>
  )
}
