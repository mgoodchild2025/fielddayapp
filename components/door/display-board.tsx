'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import QRCode from 'react-qr-code'
import { toast } from 'sonner'
import { Overlay } from '@/components/ui/overlay'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { createBroadcastSocket } from '@/lib/realtime-broadcast'
import { isIOS } from '@/lib/push-client'
import type { displayState } from '@/lib/door/service'
import { DISPLAY_TYPE, DoorStripes } from './door-stripes'
import { DoorAlertOverlay } from './door-alert-overlay'
import { useChime } from './use-chime'
import { isQuietAlert } from '@/lib/door/logic'
import { useWakeLock } from './use-wake-lock'
import {
  disableDoorPush, doorPushState, enableDoorPush, idbPut, readMyDoors, registerDoorWorker, rememberDisplayForWorker,
  writeMyDoor, type DoorPushState,
} from './door-push'
import { forgetSavedDisplay } from './join-form'

/**
 * A paired door display: screen mode (loud, full-screen, keeps the screen on)
 * and/or notify mode (Web Push on this phone, mirrored to a watch).
 *
 * Correctness comes from /state, not from broadcasts: every broadcast, tab
 * return, reconnect and 15-second tick re-reads it, so a sleeping iPad or a
 * wifi blip costs at most 15 seconds and never a missed visitor.
 */

export type DoorState = Awaited<ReturnType<typeof displayState>>
type Ring = DoorState['rings'][number]
type Sheet = null | 'menu' | 'add' | 'location' | 'devices' | 'tips'

const POLL_MS = 15_000
const CHIME_EVERY_MS = 3_500
const SCREEN_KEY = 'fieldday-door-screen'

let socket: ReturnType<typeof createBroadcastSocket> | null = null
function getSocket() {
  return (socket ??= createBroadcastSocket({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    watchLifecycle: true,
    // A display is meant to sit in the background on a phone: don't hang up after a minute hidden.
    hiddenSuspendMs: 24 * 60 * 60_000,
  }))
}

export function DisplayBoard({
  displayToken,
  initialState,
  vapidKey,
  timezone,
  orgName,
  back,
}: {
  displayToken: string
  initialState: DoorState
  vapidKey: string | null
  timezone: string
  orgName: string
  /** Opened from the app (?from=): the way back. */
  back: { href: string; label: string } | null
}) {
  const [state, setState] = useState(initialState)
  const [revoked, setRevoked] = useState(false)
  const [lastOkAt, setLastOkAt] = useState(() => Date.parse(initialState.serverTime))
  const [now, setNow] = useState(() => Date.parse(initialState.serverTime))
  const [socketOpen, setSocketOpen] = useState(true)
  const [screenArmed, setScreenArmed] = useState(false)
  const [wasArmed, setWasArmed] = useState(false)
  const [push, setPush] = useState<DoorPushState | 'loading'>('loading')
  const [pushBusy, setPushBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [testAlert, setTestAlert] = useState<number | null>(null)
  const [backLink, setBackLink] = useState(back)
  const [acking, setAcking] = useState(false)
  // Rings cleared from the quiet card: hidden here, still unanswered on the server.
  const [cleared, setCleared] = useState<ReadonlySet<string>>(() => new Set())
  const armedRef = useRef(false)
  const labelRef = useRef(initialState.display.label)
  const ackedHere = useRef(new Set<string>())
  const chime = useChime()
  const wake = useWakeLock()

  const fmtTime = useCallback(
    (iso: string) => new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso)),
    [timezone],
  )
  const ago = (iso: string) => {
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
    if (s < 45) return 'just now'
    const m = Math.round(s / 60)
    return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
  }

  // ── State from the server ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/door/display/${displayToken}/state${armedRef.current ? '?screen=1' : ''}`, { cache: 'no-store' })
      if (res.status === 410 || res.status === 404) {
        setRevoked(true)
        return
      }
      if (!res.ok) return
      const next = (await res.json()) as DoorState
      labelRef.current = next.display.label
      setState(next)
      setLastOkAt(Date.now())
    } catch { /* offline: the connection pill turns amber, then red */ }
  }, [displayToken])

  useEffect(() => {
    const tick = setInterval(refresh, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  // Clock for "2 min ago" and the connection pill.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      setSocketOpen(socket?.isOpen() ?? false)
    }, 1_000)
    return () => clearInterval(t)
  }, [])

  // Live hints over Realtime.
  const channelKey = state.station.channelKey
  useEffect(() => {
    if (!channelKey || revoked) return
    return getSocket().subscribe(`door:${channelKey}`, (event, payload) => {
      void refresh()
      const p = (payload ?? {}) as { label?: string; displayLabel?: string | null; ringId?: string }
      if (event === 'display_joined' && p.label && p.label !== labelRef.current) toast(`${p.label} joined this door`)
      if (event === 'ack' && p.ringId && !ackedHere.current.has(p.ringId)) {
        toast.success(`${p.displayLabel ?? 'Someone'} is on the way`)
      }
    })
  }, [channelKey, refresh, revoked])

  // Mount: notification state, keep the worker's token current, re-arm prompt.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await doorPushState(displayToken)
      if (cancelled) return
      setPush(s)
      if (s === 'on') {
        void registerDoorWorker() // picks up a newer sw.js
        void rememberDisplayForWorker(displayToken)
      }
    })()
    const t = setTimeout(() => {
      try { setWasArmed(sessionStorage.getItem(SCREEN_KEY) === '1') } catch { /* blocked */ }
      // Opened without ?from= (e.g. from a notification) on an admin's own device: back to settings.
      if (!back && Object.values(readMyDoors()).some((d) => d.displayToken === displayToken)) {
        setBackLink({ href: '/admin/settings/door-alert', label: 'Door Alert settings' })
      }
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [displayToken, back])

  useEffect(() => {
    if (revoked) forgetSavedDisplay(displayToken)
  }, [revoked, displayToken])

  // ── Alerting ─────────────────────────────────────────────────────────────
  const rings: Ring[] = testAlert !== null
    ? [{ ringId: 'test', visitorName: 'Test', createdAt: new Date(testAlert).toISOString() }]
    : state.rings.filter((r) => !cleared.has(r.ringId))
  const alerting = rings.length > 0
  const newestId = rings[0]?.ringId ?? null
  const newestAt = rings[0]?.createdAt ?? null
  // Unanswered for 2 minutes: stop flashing and chiming (isQuietAlert).
  const quiet = testAlert === null && newestAt !== null && isQuietAlert(newestAt, now)

  useEffect(() => {
    if (!alerting || !screenArmed || !newestAt) return
    const beat = () => {
      if (isQuietAlert(newestAt, Date.now())) return // the calm "not answered" card takes over
      chime.play()
      try { navigator.vibrate?.([400, 150, 400]) } catch { /* unsupported */ }
    }
    beat()
    const t = setInterval(beat, CHIME_EVERY_MS)
    return () => clearInterval(t)
  }, [alerting, newestId, newestAt, screenArmed, chime])

  async function onMyWay() {
    if (testAlert !== null) {
      setTestAlert(null)
      return
    }
    const ids = state.rings.map((r) => r.ringId)
    ids.forEach((id) => ackedHere.current.add(id))
    setAcking(true)
    setState((s) => ({ ...s, rings: [] }))
    try {
      const results = await Promise.all(ids.map((id) =>
        fetch(`/api/door/display/${displayToken}/rings/${id}/ack`, { method: 'POST' }).then((r) => r.ok)))
      if (results.some((ok) => !ok)) toast.error('Couldn’t confirm every ring — try again.')
    } catch {
      toast.error('Couldn’t reach the server. Check the connection and tap again.')
    }
    setAcking(false)
    void refresh()
  }

  // ── Screen mode ──────────────────────────────────────────────────────────
  function armScreen() {
    chime.unlock() // inside the tap: browsers only allow sound after one
    chime.play()
    // Armed first: the wake lock and fullscreen are extras, and a browser
    // that leaves either request pending must not stop the screen arming.
    armedRef.current = true
    setScreenArmed(true)
    setWasArmed(false)
    try { sessionStorage.setItem(SCREEN_KEY, '1') } catch { /* blocked */ }
    void wake.request()
    try {
      const el = document.documentElement
      if (!isIOS() && el.requestFullscreen && !document.fullscreenElement) void el.requestFullscreen().catch(() => {})
    } catch { /* not allowed here; the page still works */ }
    void refresh()
  }

  function disarmScreen() {
    armedRef.current = false
    setScreenArmed(false)
    wake.release()
    try { sessionStorage.removeItem(SCREEN_KEY) } catch { /* blocked */ }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }

  // ── Notify mode ──────────────────────────────────────────────────────────
  async function turnOnNotifications() {
    if (push === 'ios-install' || push === 'denied' || push === 'unsupported') {
      setSheet('tips')
      return
    }
    setPushBusy(true)
    const result = await enableDoorPush(displayToken, vapidKey)
    setPushBusy(false)
    setPush(await doorPushState(displayToken))
    if (result.ok) toast.success('Notifications are on for this device')
    else toast.error(result.error ?? 'Couldn’t turn notifications on.')
    void refresh()
  }

  async function turnOffNotifications() {
    setPushBusy(true)
    await disableDoorPush(displayToken)
    setPushBusy(false)
    setPush(await doorPushState(displayToken))
    void refresh()
  }

  async function sendTest() {
    setSheet(null)
    setTestAlert(Date.now())
    if (push === 'on' || push === 'on-app') {
      try {
        await fetch(`/api/door/display/${displayToken}/test`, { method: 'POST' })
        toast('Test notification sent to this device')
      } catch { /* the on-screen test still shows */ }
    }
  }

  // ── Station controls ─────────────────────────────────────────────────────
  async function setStationArmed(next: boolean) {
    if (!next && !(await confirmAction({
      title: 'Turn off Door Alert?',
      message: 'Visitors will see your fallback message instead of the RING button, on every device for this door.',
      confirmLabel: 'Turn off',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/door/display/${displayToken}/arm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ armed: next }),
      })
      if (!res.ok) throw new Error()
      setState((s) => ({ ...s, station: { ...s.station, isArmed: next } }))
      toast.success(next ? 'Door Alert is on' : 'Door Alert is off')
    } catch {
      toast.error('Couldn’t change it. Check the connection and try again.')
    }
  }

  async function leave() {
    if (!(await confirmAction({
      title: 'Unpair this device?',
      message: 'It stops getting door alerts. You can join again with the staff QR or code.',
      confirmLabel: 'Unpair',
      destructive: true,
    }))) return
    await disableDoorPush(displayToken).catch(() => {})
    try { await fetch(`/api/door/display/${displayToken}`, { method: 'DELETE' }) } catch { /* revoked on next admin look */ }
    forgetSavedDisplay(displayToken)
    for (const [stationId, d] of Object.entries(readMyDoors())) {
      if (d.displayToken === displayToken) {
        writeMyDoor(stationId, null)
        await idbPut(`display:${stationId}`, null)
      }
    }
    window.location.replace('/door/join')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (revoked) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-5 bg-[#0B0B0C] px-6 text-center text-white">
        <p className={`${DISPLAY_TYPE} text-5xl`}>Disconnected</p>
        <p className="max-w-sm text-lg text-white/80">This display has been disconnected. Ask an admin for a new link, or join again with the staff QR or code.</p>
        <Link href="/door/join" className="press inline-flex min-h-12 items-center rounded-2xl border border-white/30 px-6 font-semibold">Join again</Link>
      </main>
    )
  }

  const sinceOk = now - lastOkAt
  const connection = sinceOk > 60_000 ? 'offline' : socketOpen && sinceOk < 30_000 ? 'listening' : 'reconnecting'
  const { station } = state

  return (
    <>
      <main className="min-h-dvh flex flex-col bg-[#0B0B0C] text-white pb-[env(safe-area-inset-bottom)]">
        <DoorStripes className="h-3" />
        <header className="flex items-start justify-between gap-3 px-5 pt-4 sm:px-8 sm:pt-6">
          <div className="min-w-0">
            {backLink && (
              <Link href={backLink.href} className="press -ml-1 mb-1 inline-flex min-h-10 items-center px-1 text-sm font-semibold text-white/75 hover:text-white">
                ← {backLink.label}
              </Link>
            )}
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">{orgName} · Door alert</p>
            <h1 className={`${DISPLAY_TYPE} mt-1 text-5xl sm:text-7xl break-words`}>{station.name}</h1>
            <button type="button" onClick={() => setSheet('location')} className="press mt-2 min-h-10 text-left text-base text-white/80 underline decoration-white/30 underline-offset-4">
              {station.locationLabel || 'Set tonight’s location'}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConnectionPill status={connection} />
            <button type="button" onClick={() => setSheet('menu')} className="press min-h-11 rounded-xl border border-white/25 px-4 font-semibold">Menu</button>
          </div>
        </header>

        {!station.isArmed && (
          <div className="mx-5 mt-5 sm:mx-8 rounded-2xl border border-amber-400/40 bg-amber-400/15 p-4">
            <p className="font-semibold text-amber-100">Door Alert is off. Visitors see the fallback message instead of RING.</p>
            <button type="button" onClick={() => void setStationArmed(true)} className="press mt-3 min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-black">Turn it on</button>
          </div>
        )}

        <section className="grid gap-4 px-5 mt-6 sm:grid-cols-2 sm:px-8" aria-label="Alert modes">
          <ModeCard
            title="Screen"
            body={screenArmed
              ? wake.supported
                ? wake.active ? 'Armed. The screen stays on and chimes for every ring.' : 'Armed. Tap the screen if it dims; keep this page open.'
                : 'Armed. Turn off auto-lock (see Setup tips) so the screen stays on.'
              : wasArmed
                ? 'Tap to re-arm: browsers need a tap before they can make sound.'
                : 'Full-screen flash and a chime that repeats until someone answers. For a tablet or laptop that sits out.'}
            on={screenArmed}
            action={screenArmed
              ? <button type="button" onClick={disarmScreen} className="press min-h-12 rounded-xl border border-white/30 px-5 font-semibold">Stop screen</button>
              : <BigButton onClick={armScreen}>{wasArmed ? 'Re-arm screen' : 'Arm screen'}</BigButton>}
          />
          <ModeCard
            title="Notifications"
            body={pushBody(push)}
            on={push === 'on' || push === 'on-app'}
            action={push === 'on-app' ? null : push === 'on'
              ? <button type="button" disabled={pushBusy} onClick={() => void turnOffNotifications()} className="press min-h-12 rounded-xl border border-white/30 px-5 font-semibold disabled:opacity-50">Turn off</button>
              : push === 'loading' ? null
              : <BigButton disabled={pushBusy} onClick={() => void turnOnNotifications()}>
                  {push === 'ios-install' ? 'How to turn on' : push === 'denied' || push === 'unsupported' ? 'Why not?' : pushBusy ? 'Turning on…' : 'Enable notifications'}
                </BigButton>}
          />
        </section>

        <section className="px-5 sm:px-8 mt-8 mb-8 grid gap-2 text-white/80" aria-label="Recent activity">
          {state.lastRing ? (
            <p>
              Last ring <span className="font-semibold text-white">{fmtTime(state.lastRing.createdAt)}</span>
              {' '}({ago(state.lastRing.createdAt)}){state.lastRing.visitorName ? <> · {state.lastRing.visitorName}</> : null}
              {state.lastRing.acknowledgedAt
                ? <> · answered{state.lastRing.acknowledgedBy ? <> by {state.lastRing.acknowledgedBy}</> : null}</>
                : null}
            </p>
          ) : (
            <p>No rings yet.</p>
          )}
          <button type="button" onClick={() => setSheet('devices')} className="press min-h-10 w-fit text-left underline decoration-white/30 underline-offset-4">
            {state.displays.length} device{state.displays.length === 1 ? '' : 's'} on this door
          </button>
        </section>
      </main>

      {alerting && (
        <DoorAlertOverlay
          stationName={state.station.name}
          rings={rings}
          test={testAlert !== null}
          acking={acking}
          onMyWay={() => void onMyWay()}
          fmtTime={fmtTime}
          ago={ago}
          quiet={quiet}
          onClear={() => setCleared((prev) => new Set([...prev, ...rings.map((r) => r.ringId)]))}
        />
      )}

      <Overlay
        open={sheet !== null}
        onClose={() => setSheet(null)}
        variant="sheet"
        label="Door display menu"
        zIndex={alerting ? 50 : undefined}
        panelClassName="w-full sm:max-w-md bg-[#17171b] text-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto"
      >
        {sheet === 'menu' && (
          <SheetBody title="Menu" onClose={() => setSheet(null)}>
            <MenuItem onClick={() => setSheet('add')} title="Add a device" hint="Show the staff QR and code" />
            <MenuItem onClick={() => setSheet('location')} title="Location" hint={station.locationLabel || 'Not set'} />
            <MenuItem
              onClick={() => { setSheet(null); void setStationArmed(!station.isArmed) }}
              title={station.isArmed ? 'Turn Door Alert off' : 'Turn Door Alert on'}
              hint={station.isArmed ? 'Visitors can ring' : 'Visitors see the fallback message'}
            />
            <MenuItem onClick={() => setSheet('devices')} title="Paired devices" hint={`${state.displays.length} on this door`} />
            <MenuItem onClick={() => void sendTest()} title="Test alert" hint="Shows an alert here (and a notification, if on)" />
            <MenuItem onClick={() => setSheet('tips')} title="Setup tips" hint="Keep the screen on, notifications, watches" />
            <MenuItem onClick={() => { setSheet(null); void leave() }} title="Leave" hint="Unpair this device" danger />
          </SheetBody>
        )}
        {sheet === 'add' && <AddDevice displayToken={displayToken} onBack={() => setSheet('menu')} />}
        {sheet === 'location' && (
          <LocationForm
            displayToken={displayToken}
            initial={station.locationLabel ?? ''}
            onBack={() => setSheet(null)}
            onSaved={(locationLabel) => {
              setState((s) => ({ ...s, station: { ...s.station, locationLabel } }))
              setSheet(null)
            }}
          />
        )}
        {sheet === 'devices' && (
          <SheetBody title="Paired devices" onBack={() => setSheet('menu')}>
            <ul className="divide-y divide-white/10">
              {state.displays.map((d, i) => (
                <li key={i} className="py-3">
                  <p className="font-semibold">{d.label}{d.isYou ? <span className="text-white/60 font-normal"> (this device)</span> : null}</p>
                  <p className="text-sm text-white/70">
                    {d.mode === 'both' ? 'Screen + notifications' : d.mode === 'screen' ? 'Screen' : d.mode === 'notify' ? 'Notifications' : 'Not alerting'}
                    {d.lastSeenAt ? <> · seen {ago(d.lastSeenAt)}</> : null}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-white/60">An admin can remove devices from Fieldday’s admin settings.</p>
          </SheetBody>
        )}
        {sheet === 'tips' && <SetupTips push={push} onBack={() => setSheet('menu')} />}
      </Overlay>
    </>
  )
}

function pushBody(push: DoorPushState | 'loading'): string {
  switch (push) {
    case 'on': return 'On. Rings show on this device’s lock screen and on a paired watch.'
    case 'on-app': return 'On, through your Fieldday app. Turn it off from Admin → Settings → Door Alert.'
    case 'ios-install': return 'On iPhone and iPad, add this page to your Home Screen first; Apple only allows notifications there.'
    case 'denied': return 'Blocked in this browser’s settings. See how to allow them.'
    case 'unsupported': return 'This browser can’t receive notifications. Use screen mode, or open this page in Chrome or Safari.'
    case 'loading': return 'Checking…'
    default: return 'Alerts on this phone’s lock screen (and a paired watch), even with the page closed.'
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function ConnectionPill({ status }: { status: 'listening' | 'reconnecting' | 'offline' }) {
  const label = status === 'listening' ? 'Listening' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'
  const dot = status === 'listening' ? 'bg-emerald-400' : status === 'reconnecting' ? 'bg-amber-400' : 'bg-red-500'
  return (
    <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dot} ${status === 'listening' ? 'motion-safe:animate-pulse' : ''}`} />
      <span className="max-sm:sr-only">{label}</span>
    </span>
  )
}

function BigButton({ children, onClick, disabled, type = 'button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press min-h-14 rounded-2xl px-6 text-xl ${DISPLAY_TYPE} disabled:opacity-50`}
      style={{ backgroundColor: 'var(--door-primary)', color: 'var(--door-on-primary)' }}
    >
      {children}
    </button>
  )
}

function ModeCard({ title, body, on, action }: { title: string; body: string; on: boolean; action: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-4 ${on ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/15 bg-white/[0.04]'}`}>
      <div>
        <p className="flex items-center gap-2 text-lg font-bold">
          {title}
          {on && <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold text-black">ON</span>}
        </p>
        <p className="mt-1 text-white/80">{body}</p>
      </div>
      {action && <div className="flex">{action}</div>}
    </div>
  )
}

function SheetBody({ title, children, onBack, onClose }: { title: string; children: React.ReactNode; onBack?: () => void; onClose?: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        {onBack ? <button type="button" onClick={onBack} className="press min-h-10 font-semibold text-white/80">← Back</button> : <span />}
        <h2 className="text-lg font-bold">{title}</h2>
        {onClose ? <button type="button" onClick={onClose} className="press min-h-10 font-semibold text-white/80">Done</button> : <span className="w-12" />}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function MenuItem({ title, hint, onClick, danger }: { title: string; hint: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="press flex w-full min-h-14 flex-col items-start justify-center border-b border-white/10 py-2 text-left last:border-0">
      <span className={`font-semibold ${danger ? 'text-red-300' : ''}`}>{title}</span>
      <span className="text-sm text-white/65">{hint}</span>
    </button>
  )
}

function AddDevice({ displayToken, onBack }: { displayToken: string; onBack: () => void }) {
  const [link, setLink] = useState<{ joinUrl: string; joinCode: string; typeUrl: string } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/door/display/${displayToken}/join-link`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => { if (!cancelled) setLink(body) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [displayToken])
  return (
    <SheetBody title="Add a device" onBack={onBack}>
      {failed && <p role="alert" className="text-red-300">Couldn’t load the join code. Check the connection.</p>}
      {link && (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-white/80">On the other phone, scan this with the camera:</p>
          <div className="rounded-2xl bg-white p-4">
            <QRCode value={link.joinUrl} size={232} level="M" />
          </div>
          <p className="text-white/80">Or go to <span className="font-semibold text-white">{link.typeUrl.replace(/^https?:\/\//, '')}</span> and type:</p>
          <p className="font-mono text-5xl font-bold tracking-[0.15em]">{link.joinCode}</p>
        </div>
      )}
    </SheetBody>
  )
}

function LocationForm({ displayToken, initial, onBack, onSaved }: {
  displayToken: string
  initial: string
  onBack: () => void
  onSaved: (label: string | null) => void
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`/api/door/display/${displayToken}/station`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationLabel: value }),
      })
      if (!res.ok) throw new Error()
      const body = await res.json()
      toast.success('Location updated')
      onSaved(body.locationLabel)
    } catch {
      toast.error('Couldn’t save. Check the connection and try again.')
      setBusy(false)
    }
  }
  return (
    <SheetBody title="Tonight’s location" onBack={onBack}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="block">
          <span className="block text-sm text-white/80 mb-1.5">Shown to visitors and in the ring log</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 80))}
            maxLength={80}
            data-autofocus
            className="w-full rounded-xl bg-white/10 border border-white/25 px-4 py-3 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            placeholder="e.g. Georgian College, east doors"
          />
        </label>
        <BigButton type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</BigButton>
      </form>
    </SheetBody>
  )
}

function SetupTips({ push, onBack }: { push: DoorPushState | 'loading'; onBack: () => void }) {
  const ios = typeof navigator !== 'undefined' && isIOS()
  const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  return (
    <SheetBody title="Setup tips" onBack={onBack}>
      <div className="flex flex-col gap-5 text-white/85">
        {ios && push === 'ios-install' && (
          <section>
            <h3 className="font-bold text-white">Turn on notifications (iPhone / iPad)</h3>
            <ol className="mt-2 list-decimal pl-5 space-y-1">
              <li>Tap the Share button (the square with an arrow).</li>
              <li>Choose <strong>Add to Home Screen</strong>, then Add.</li>
              <li>Open the new icon from your Home Screen and tap <strong>Enable notifications</strong>.</li>
            </ol>
          </section>
        )}
        {push === 'denied' && (
          <section>
            <h3 className="font-bold text-white">Notifications are blocked</h3>
            <p className="mt-1">
              {ios ? 'Settings → Notifications → find this app → Allow Notifications.'
                : android ? 'Tap the icon left of the address bar → Permissions → Notifications → Allow, then reload.'
                : 'Open this site’s settings from the address bar, allow Notifications, then reload.'}
            </p>
          </section>
        )}
        <section>
          <h3 className="font-bold text-white">Keep the screen on</h3>
          <p className="mt-1">
            {ios ? 'Settings → Display & Brightness → Auto-Lock → Never. For a shared iPad, turn on Guided Access (Settings → Accessibility) to lock it to this page.'
              : android ? 'Settings → Display → Screen timeout → the longest option. Screen pinning (Settings → Security) keeps it on this page.'
              : 'Turn off sleep in your computer’s power settings while this page is up, and keep the volume up.'}
          </p>
        </section>
        <section>
          <h3 className="font-bold text-white">Watches</h3>
          <p className="mt-1">Alerts mirror to a paired Apple Watch or Wear OS watch when the phone is locked. Check the phone’s watch app lets this app’s notifications through.</p>
        </section>
        <section>
          <h3 className="font-bold text-white">Loud enough?</h3>
          <p className="mt-1">Turn the volume all the way up and use Test alert from the menu. Silent mode can mute the chime on phones.</p>
        </section>
      </div>
    </SheetBody>
  )
}
