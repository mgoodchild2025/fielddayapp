'use client'

import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushState, type PushState } from '@/lib/push-client'
import { getVapidPublicKey } from '@/actions/push'

/**
 * Profile → "Phone alerts": the always-available switch for this device, for
 * players who dismissed the dashboard nudge or want alerts off again.
 * State is per browser/device, which the copy says out loud.
 */
export function PushSettingsCard() {
  const [state, setState] = useState<PushState | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // Browser-only reads, resolved after mount.
    const timer = setTimeout(() => setState(pushState()), 0)
    currentSubscription().then((s) => setSubscribed(!!s)).catch(() => {})
    getVapidPublicKey().then((key) => setConfigured(!!key)).catch(() => {})
    return () => clearTimeout(timer)
  }, [])

  async function turnOn() {
    setBusy(true); setErr(null)
    const r = await enablePush()
    setBusy(false)
    setState(pushState())
    if (r.ok) setSubscribed(true)
    else setErr(r.error ?? 'Something went wrong.')
  }

  async function turnOff() {
    setBusy(true); setErr(null)
    try { await disablePush(); setSubscribed(false) } finally { setBusy(false) }
  }

  if (state === null) return null

  let body: React.ReactNode
  if (state === 'unsupported') {
    body = isIOS() && !isStandalone() ? (
      <p className="text-sm text-gray-600">
        On iPhone, alerts only work once this site is on your home screen: tap Share in Safari, then
        <span className="font-semibold"> Add to Home Screen</span>, and come back here from that icon.
      </p>
    ) : (
      <p className="text-sm text-gray-600">This browser can&rsquo;t receive alerts.</p>
    )
  } else if (!configured) {
    body = <p className="text-sm text-gray-600">Phone alerts aren&rsquo;t switched on for this site yet.</p>
  } else if (state === 'denied') {
    body = <p className="text-sm text-gray-600">Notifications are blocked for this site in your browser settings. Allow them there, then reload.</p>
  } else if (state === 'granted' && subscribed) {
    body = (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-700"><span className="font-semibold text-green-700">On</span> for this device.</p>
        <button type="button" onClick={turnOff} disabled={busy} className="text-sm font-medium border rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {busy ? 'Turning off…' : 'Turn off'}
        </button>
      </div>
    )
  } else {
    body = (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-700">Schedule changes, scores to confirm, sub requests — on this device.</p>
        <button type="button" onClick={turnOn} disabled={busy} className="px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60 shrink-0" style={{ backgroundColor: 'var(--brand-primary)' }}>
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone alerts</p>
        <p className="text-xs text-gray-400 mt-0.5">Push notifications for this device. Each phone or browser is switched on separately.</p>
      </div>
      <div className="p-5">
        {body}
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      </div>
    </div>
  )
}
