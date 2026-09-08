'use client'

import { useEffect, useState } from 'react'
import { Bell, Share, X } from 'lucide-react'
import { enablePush, isIOS, isMobile, isStandalone, pushState } from '@/lib/push-client'
import { getVapidPublicKey } from '@/actions/push'

/**
 * Dashboard card that gets a phone from "visits the site" to "gets alerts".
 * Mobile only, shown from the second dashboard visit, dismissible for 30 days.
 *
 *   not installed  → "Add to home screen" (Android: real install dialog when
 *                     Chrome offers one; iOS: Share-sheet instructions)
 *   installed, permission undecided → "Turn on alerts" (asks from the tap)
 *   installed + granted, or denied, or desktop → renders nothing
 *
 * iOS only allows Web Push inside an installed app, which is why the install
 * step comes first and the copy sells alerts, not the install itself.
 */

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const DISMISS_KEY = 'fieldday-alerts-nudge-dismissed'
const VISITS_KEY = 'fieldday-dashboard-visits'
const DISMISS_DAYS = 30

type Mode = 'hidden' | 'install' | 'enable' | 'done'

export function AlertsNudge({ orgName }: { orgName: string }) {
  const [mode, setMode] = useState<Mode>('hidden')
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosSteps, setShowIosSteps] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // Decide after paint: reads browser/storage state, so it can't run on the server.
    const timer = setTimeout(() => {
      try {
        if (!isMobile()) return
        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
        if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400_000) return
        const visits = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1
        localStorage.setItem(VISITS_KEY, String(visits))
        if (visits < 2) return

        if (isStandalone()) {
          if (pushState() === 'default') {
            // Only offer the switch when the server can actually deliver.
            getVapidPublicKey().then((key) => { if (key) setMode('enable') }).catch(() => {})
          }
        } else {
          setMode('install')
        }
      } catch { /* storage unavailable — stay hidden */ }
    }, 0)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setMode('hidden')
  }

  async function handleInstall() {
    if (installEvent) {
      setBusy(true)
      try {
        await installEvent.prompt()
        const { outcome } = await installEvent.userChoice
        if (outcome === 'accepted') setMode('done')
      } finally { setBusy(false) }
      return
    }
    setShowIosSteps(true)
  }

  async function handleEnable() {
    setBusy(true); setErr(null)
    const r = await enablePush()
    setBusy(false)
    if (r.ok) setMode('done')
    else setErr(r.error ?? 'Something went wrong.')
  }

  if (mode === 'hidden') return null

  if (mode === 'done') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        {installEvent ? `${orgName} is on your home screen. Open it there to turn on alerts.` : 'Alerts are on for this phone.'}
      </div>
    )
  }

  const ios = isIOS()

  return (
    <div className="relative rounded-xl border bg-white px-4 py-4 shadow-sm">
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 rounded-full p-2 text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
          <Bell className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Get game alerts on your phone</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {mode === 'install'
              ? `Add ${orgName} to your home screen to get schedule changes, scores to confirm, and sub requests the moment they happen.`
              : 'Schedule changes, scores to confirm, and sub requests — the moment they happen.'}
          </p>

          {mode === 'install' && !showIosSteps && (
            <button type="button" onClick={handleInstall} disabled={busy}
              className="mt-3 px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}>
              {installEvent ? 'Add to home screen' : 'Show me how'}
            </button>
          )}

          {mode === 'install' && showIosSteps && (
            <ol className="mt-3 space-y-1.5 text-xs text-gray-700 list-decimal pl-4">
              {ios ? (
                <>
                  <li>Tap the <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Share" /> Share button in Safari&rsquo;s toolbar.</li>
                  <li>Scroll and choose <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>.</li>
                  <li>Open {orgName} from your home screen and tap <span className="font-semibold">Turn on alerts</span>.</li>
                </>
              ) : (
                <>
                  <li>Open the browser menu (⋮).</li>
                  <li>Choose <span className="font-semibold">Add to Home screen</span> or <span className="font-semibold">Install app</span>.</li>
                  <li>Open {orgName} from your home screen and tap <span className="font-semibold">Turn on alerts</span>.</li>
                </>
              )}
            </ol>
          )}

          {mode === 'enable' && (
            <button type="button" onClick={handleEnable} disabled={busy}
              className="mt-3 px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}>
              {busy ? 'Turning on…' : 'Turn on alerts'}
            </button>
          )}
          {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        </div>
      </div>
    </div>
  )
}
