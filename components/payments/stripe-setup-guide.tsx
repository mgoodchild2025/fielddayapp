'use client'

import { useState } from 'react'

interface Step {
  title: string
  content: (props: { orgSlug: string; onCopy: (text: string) => void; copied: string | null }) => React.ReactNode
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-dotted" style={{ color: 'var(--brand-primary)' }}>
      {children} ↗
    </a>
  )
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center mt-0.5" style={{ backgroundColor: 'var(--brand-primary)' }}>
        {number}
      </div>
      <div className="flex-1 text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  )
}

function CodeBox({ value, onCopy, copied }: { value: string; onCopy: (v: string) => void; copied: string | null }) {
  const isCopied = copied === value
  return (
    <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2 mt-2">
      <code className="text-xs text-gray-700 flex-1 break-all font-mono">{value}</code>
      <button
        type="button"
        onClick={() => onCopy(value)}
        className="text-xs font-medium shrink-0 px-2 py-0.5 rounded border transition-colors"
        style={isCopied ? { backgroundColor: 'var(--brand-primary)', color: 'white', borderColor: 'var(--brand-primary)' } : {}}
      >
        {isCopied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

function NavPath({ items }: { items: string[] }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2.5 py-1.5 rounded-md mt-2 font-mono">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-400">›</span>}
          <span>{item}</span>
        </span>
      ))}
    </div>
  )
}

const STEPS: Step[] = [
  {
    title: 'Create a Stripe account',
    content: () => (
      <div className="space-y-4">
        <p>Stripe is the payment processor that handles your players&apos; credit card payments. It&apos;s free to sign up — you only pay a small per-transaction fee when a payment is made.</p>
        <Step number={1}>
          Visit{' '}
          <ExternalLink href="https://dashboard.stripe.com/register">dashboard.stripe.com/register</ExternalLink>{' '}
          and create an account using your organization&apos;s email address.
        </Step>
        <Step number={2}>
          Complete Stripe&apos;s verification steps. You&apos;ll need to provide your organization&apos;s business details and a bank account to receive payouts.
        </Step>
        <Step number={3}>
          Once your account is active, continue to the next step.
        </Step>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
          <strong>Tip:</strong> You can test the integration first using Stripe&apos;s test mode (no real money is charged). Switch to live mode when you&apos;re ready to accept real payments.
        </div>
      </div>
    ),
  },
  {
    title: 'Get your Secret Key',
    content: () => (
      <div className="space-y-4">
        <p>The Secret Key allows Fieldday to create payment sessions on your behalf. It never leaves your server and is never shared with players.</p>
        <Step number={1}>
          Log into your{' '}
          <ExternalLink href="https://dashboard.stripe.com">Stripe Dashboard</ExternalLink>.
        </Step>
        <Step number={2}>
          In the left sidebar, click <strong>Developers</strong>, then <strong>API keys</strong>.
          <NavPath items={['Developers', 'API keys']} />
        </Step>
        <Step number={3}>
          You&apos;ll see two keys: a <em>Publishable key</em> and a <em>Secret key</em>. Click <strong>Reveal live key</strong> under the Secret key section.
        </Step>
        <Step number={4}>
          Copy the key — it starts with <code className="bg-gray-100 px-1 rounded text-[11px]">sk_live_</code> (or <code className="bg-gray-100 px-1 rounded text-[11px]">sk_test_</code> in test mode).
        </Step>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
          <strong>Security:</strong> Keep your Secret Key private. Never share it publicly or put it in a website&apos;s front-end code.
        </div>
      </div>
    ),
  },
  {
    title: 'Enter your Secret Key in Fieldday',
    content: () => (
      <div className="space-y-4">
        <p>Now paste the key you just copied into Fieldday.</p>
        <Step number={1}>
          Scroll down on this page to the <strong>Secret Key</strong> field in the form below the guide.
        </Step>
        <Step number={2}>
          Paste your key into the field. You&apos;ll see a <strong>LIVE</strong> or <strong>TEST</strong> badge appear to confirm the mode.
        </Step>
        <Step number={3}>
          Don&apos;t click Save yet — continue to the next step to also add your webhook secret, then save both at once.
        </Step>
        <div className="mt-4 p-3 bg-gray-50 border rounded-lg text-xs text-gray-600">
          You can come back and update your key at any time. Changing from test to live mode will seamlessly switch all new checkouts to real payments.
        </div>
      </div>
    ),
  },
  {
    title: 'Add a webhook endpoint in Stripe',
    content: ({ orgSlug, onCopy, copied }) => {
      const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
      const webhookUrl = `https://${orgSlug}.${platformDomain}/api/stripe/webhook`
      return (
        <div className="space-y-4">
          <p>Webhooks let Stripe notify Fieldday the moment a payment succeeds, so registrations are confirmed automatically. Without this, you&apos;d have to approve payments manually.</p>
          <Step number={1}>
            In your Stripe Dashboard, go to <strong>Developers → Webhooks</strong>.
            <NavPath items={['Developers', 'Webhooks']} />
          </Step>
          <Step number={2}>
            Click <strong>Add endpoint</strong> (or <strong>+ Add destination</strong> in newer Stripe UI).
          </Step>
          <Step number={3}>
            Paste this URL as the endpoint URL:
            <CodeBox value={webhookUrl} onCopy={onCopy} copied={copied} />
          </Step>
          <Step number={4}>
            Under <strong>Select events</strong>, search for and select these events:
            <ul className="mt-2 space-y-1.5 ml-1">
              {['checkout.session.completed', 'payment_intent.payment_failed'].map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-mono">{e}</code>
                </li>
              ))}
            </ul>
          </Step>
          <Step number={5}>
            Click <strong>Add endpoint</strong> to save it.
          </Step>
        </div>
      )
    },
  },
  {
    title: 'Copy the Webhook Signing Secret',
    content: () => (
      <div className="space-y-4">
        <p>After adding your webhook endpoint, Stripe generates a signing secret that lets Fieldday verify the webhook is really coming from Stripe (and not an attacker).</p>
        <Step number={1}>
          After saving your endpoint, Stripe will show the endpoint detail page. Click <strong>Reveal</strong> under the <strong>Signing secret</strong> section.
        </Step>
        <Step number={2}>
          Copy the signing secret — it starts with <code className="bg-gray-100 px-1 rounded text-[11px]">whsec_</code>.
        </Step>
        <Step number={3}>
          Scroll down on this page and paste it into the <strong>Webhook Signing Secret</strong> field.
        </Step>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
          <strong>Note:</strong> If you&apos;re testing with Stripe&apos;s webhook test tool, it provides a different signing secret. Make sure to use the one from your live (or test mode) endpoint, not the CLI test secret.
        </div>
      </div>
    ),
  },
  {
    title: 'Save and verify',
    content: () => (
      <div className="space-y-4">
        <p>You&apos;re almost there. Let&apos;s save everything and make sure it&apos;s working.</p>
        <Step number={1}>
          Scroll down on this page. Make sure both the <strong>Secret Key</strong> and <strong>Webhook Signing Secret</strong> fields are filled in.
        </Step>
        <Step number={2}>
          Click <strong>Save</strong>. The status indicators at the top will update to show both as configured.
        </Step>
        <Step number={3}>
          To test the full flow, set a league fee on a test event, register a player, and use Stripe&apos;s test card number <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-mono">4242 4242 4242 4242</code> with any future expiry date and any CVC.
        </Step>
        <Step number={4}>
          After the test payment, check that the registration shows as <strong>Active</strong> and the payment shows as <strong>Paid</strong> in your admin dashboard.
        </Step>
        <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-800">
          <strong>All done!</strong> When you&apos;re ready to accept real payments, repeat this process using your live mode Stripe keys — or toggle to live mode in the Stripe dashboard and copy your live keys.
        </div>
      </div>
    ),
  },
]

interface Props {
  orgSlug: string
}

export function StripeSetupGuide({ orgSlug }: Props) {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  function close() {
    setOpen(false)
    setCurrentStep(0)
  }

  const step = STEPS[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === STEPS.length - 1

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: 'var(--brand-primary)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        How to set up Stripe
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={close} />

          {/* Drawer */}
          <div className="w-full max-w-md bg-white flex flex-col shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Stripe Setup Guide</p>
                <h2 className="text-lg font-bold text-gray-900">
                  Step {currentStep + 1} of {STEPS.length}: {step.title}
                </h2>
              </div>
              <button onClick={close} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0 ml-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Step progress bar */}
            <div className="px-6 pt-3 shrink-0">
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className="flex-1 h-1 rounded-full transition-colors"
                    style={{ backgroundColor: i <= currentStep ? 'var(--brand-primary)' : '#e5e7eb' }}
                    aria-label={`Go to step ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step.content({ orgSlug, onCopy: handleCopy, copied })}
            </div>

            {/* Navigation */}
            <div className="px-6 py-4 border-t flex items-center justify-between gap-3 shrink-0 bg-gray-50">
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
                disabled={isFirst}
                className="px-4 py-2 rounded-md text-sm font-medium border text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Back
              </button>
              <span className="text-xs text-gray-400">{currentStep + 1} / {STEPS.length}</span>
              {isLast ? (
                <button
                  onClick={close}
                  className="px-5 py-2 rounded-md text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Done ✓
                </button>
              ) : (
                <button
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="px-5 py-2 rounded-md text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
