'use client'

import { useState, useTransition } from 'react'
import { savePaymentSettings, clearPaymentSettings } from '@/actions/payment-settings'

interface Props {
  orgSlug: string
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  isTestMode: boolean | null
}

export function StripeKeyForm({ orgSlug, hasSecretKey, hasWebhookSecret, isTestMode }: Props) {
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const webhookUrl = `https://${orgSlug}.${platformDomain}/api/stripe/webhook`

  const detectedMode = secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : null

  function handleSave() {
    setErr(null)
    setSaved(false)
    startTransition(async () => {
      const res = await savePaymentSettings({ stripeSecretKey: secretKey, stripeWebhookSecret: webhookSecret })
      if (res.error) { setErr(res.error) } else { setSaved(true); setSecretKey(''); setWebhookSecret('') }
    })
  }

  function handleClear() {
    if (!confirm('Remove Stripe configuration? Players will no longer be able to pay online.')) return
    setErr(null)
    startTransition(async () => {
      await clearPaymentSettings()
    })
  }

  const isConfigured = hasSecretKey

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-800">Stripe</p>
          <p className="text-sm text-gray-500 mt-0.5">Accept online payments using your own Stripe account</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConfigured && isTestMode && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Test mode</span>
          )}
          {isConfigured && !isTestMode && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Live · Active</span>
          )}
          {!isConfigured && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Not configured</span>
          )}
        </div>
      </div>

      {isConfigured && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Secret key</p>
            <p className="font-semibold text-green-600">Configured ✓</p>
          </div>
          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Webhook secret</p>
            <p className={`font-semibold ${hasWebhookSecret ? 'text-green-600' : 'text-amber-600'}`}>
              {hasWebhookSecret ? 'Configured ✓' : 'Not set'}
            </p>
          </div>
        </div>
      )}

      {/* Key entry form */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-700">
          {isConfigured ? 'Update keys' : 'Enter your Stripe API keys'}
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Secret Key
            {detectedMode && (
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${detectedMode === 'live' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {detectedMode === 'live' ? 'LIVE' : 'TEST'}
              </span>
            )}
          </label>
          <div className="relative">
            <input
              type={showSecretKey ? 'text' : 'password'}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={isConfigured ? '(leave blank to keep existing)' : 'sk_live_... or sk_test_...'}
              className="w-full border rounded-md px-3 py-2 text-sm pr-20 font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecretKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
            >
              {showSecretKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Find this in your{' '}
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard → Developers → API keys</a>
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Webhook Signing Secret</label>
          <div className="relative">
            <input
              type={showWebhookSecret ? 'text' : 'password'}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={isConfigured && hasWebhookSecret ? '(leave blank to keep existing)' : 'whsec_...'}
              className="w-full border rounded-md px-3 py-2 text-sm pr-20 font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowWebhookSecret((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
            >
              {showWebhookSecret ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {saved && <p className="text-sm text-green-600">Settings saved.</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={isPending || (!secretKey && !webhookSecret)}
          className="px-5 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {isConfigured && (
          <button
            onClick={handleClear}
            disabled={isPending}
            className="px-4 py-2 rounded-md text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {/* Webhook setup instructions */}
      <div className="border-t pt-5 space-y-3">
        <p className="text-sm font-medium text-gray-700">Webhook setup</p>
        <p className="text-xs text-gray-500">
          Add this endpoint in{' '}
          <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard → Developers → Webhooks</a>
          {' '}so Fieldday is notified when payments complete:
        </p>
        <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2">
          <code className="text-xs text-gray-700 flex-1 break-all font-mono">{webhookUrl}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-gray-500">
          After adding the endpoint, copy the <strong>Signing secret</strong> (whsec_…) from Stripe and paste it in the Webhook Signing Secret field above.
          Enable the <code className="bg-gray-100 px-1 rounded text-[11px]">checkout.session.completed</code> event at minimum.
        </p>
      </div>
    </div>
  )
}
