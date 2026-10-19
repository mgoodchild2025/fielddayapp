'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createBroadcastSocket } from '@/lib/realtime-broadcast'
import { DoorAlertOverlay, type AlertRing } from './door-alert-overlay'
import { readMyDoors, writeMyDoor } from './door-push'
import { forgetSavedDisplay, readSavedDisplay } from './join-form'
import { doorAudioReady, unlockDoorAudio, useChime } from './use-chime'
import { isQuietAlert } from '@/lib/door/logic'

/**
 * The in-app door alert. On every Fieldday page (mounted by the org layout,
 * which wraps admin too), a device paired to a door — "Open door screen" /
 * "Alert me on this device", or a staff-card join in this browser — watches
 * that door and takes over the screen when someone rings: the same alert as
 * the door screen, with ON MY WAY, Open door screen and Hide. It doesn't
 * navigate on its own (that could throw away an unsaved form).
 *
 * Sound only if the door screen was armed earlier in this page session (the
 * shared AudioContext is still unlocked); otherwise it's visual + vibration,
 * and the push notification covers a phone that's put away.
 *
 * Renders nothing — and opens no socket — on a device with no pairings.
 */

type Door = { token: string; stationName: string; channelKey: string; rings: AlertRing[] }

const CHIME_EVERY_MS = 3_500
const SCREEN_KEY = 'fieldday-door-screen'
const SAFETY_POLL_MS = 60_000

let socket: ReturnType<typeof createBroadcastSocket> | null = null
function getSocket() {
  return (socket ??= createBroadcastSocket({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    watchLifecycle: true,
  }))
}

function pairedTokens(): string[] {
  const tokens = new Set(Object.values(readMyDoors()).map((d) => d.displayToken))
  const joined = readSavedDisplay()
  if (joined) tokens.add(joined.displayToken)
  return [...tokens]
}

/** A display was disconnected: forget it everywhere this browser remembers it. */
function forgetToken(token: string) {
  for (const [stationId, d] of Object.entries(readMyDoors())) if (d.displayToken === token) writeMyDoor(stationId, null)
  forgetSavedDisplay(token)
}

export function DoorWatcher() {
  const pathname = usePathname()
  const [tokens, setTokens] = useState<string[]>([])
  const [doors, setDoors] = useState<Record<string, Door>>({})
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [acking, setAcking] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const armedRef = useRef(false)
  const { play } = useChime()

  // Pairings live in this browser's storage; re-read after each navigation
  // (pairing happens on admin pages and the door screen).
  useEffect(() => {
    const t = setTimeout(() => {
      const next = pairedTokens()
      setTokens((prev) => (prev.length === next.length && prev.every((x, i) => x === next[i]) ? prev : next))
      try { armedRef.current = sessionStorage.getItem(SCREEN_KEY) === '1' } catch { /* blocked */ }
      // Armed earlier but the page reloaded since: sound needs a fresh tap, so
      // the next tap anywhere unlocks it.
      if (armedRef.current && next.length > 0 && !doorAudioReady()) {
        window.addEventListener('pointerdown', unlockDoorAudio, { once: true })
      }
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', unlockDoorAudio)
    }
  }, [pathname])

  const refresh = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/door/display/${token}/state`, { cache: 'no-store' })
      if (res.status === 410) {
        forgetToken(token)
        setTokens((prev) => prev.filter((t) => t !== token))
        return
      }
      if (!res.ok) return // feature off, door deleted, offline: just don't alert
      const s = await res.json()
      setDoors((prev) => ({ ...prev, [token]: { token, stationName: s.station.name, channelKey: s.station.channelKey, rings: s.rings } }))
    } catch { /* offline: try again on the next hint */ }
  }, [])

  // Initial read + whenever the app comes back to the front (a ring may have
  // arrived while it was away).
  useEffect(() => {
    if (tokens.length === 0) return
    tokens.forEach((t) => void refresh(t))
    const onVisible = () => { if (document.visibilityState === 'visible') tokens.forEach((t) => void refresh(t)) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    // Safety net for a socket that died quietly.
    const poll = setInterval(onVisible, SAFETY_POLL_MS)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [tokens, refresh])

  // Live: any broadcast on a watched door re-reads its state.
  const channels = Object.values(doors).filter((d) => tokens.includes(d.token)).map((d) => `${d.token}|${d.channelKey}`).sort().join(',')
  useEffect(() => {
    if (!channels) return
    const unsubs = channels.split(',').map((pair) => {
      const [token, channelKey] = pair.split('|')
      return getSocket().subscribe(`door:${channelKey}`, () => void refresh(token))
    })
    return () => unsubs.forEach((u) => u())
  }, [channels, refresh])

  // The door to alert for: the one with the newest ring this user hasn't hidden.
  const alerting = Object.values(doors)
    .filter((d) => tokens.includes(d.token))
    .map((d) => ({ ...d, rings: d.rings.filter((r) => !hidden.has(r.ringId)) }))
    .filter((d) => d.rings.length > 0)
    .sort((a, b) => Date.parse(b.rings[0].createdAt) - Date.parse(a.rings[0].createdAt))[0] ?? null
  const newestId = alerting?.rings[0]?.ringId ?? null
  const newestAt = alerting?.rings[0]?.createdAt ?? null

  // While alerting: the clock for "1 min ago", vibration, and the chime if
  // the door screen was armed this session — until the alert quiets (2 min).
  useEffect(() => {
    if (!newestId || !newestAt) return
    const beat = () => {
      setNow(Date.now())
      if (isQuietAlert(newestAt, Date.now())) return
      if (armedRef.current && doorAudioReady()) play()
      try { navigator.vibrate?.([400, 150, 400]) } catch { /* unsupported */ }
    }
    beat()
    const t = setInterval(beat, CHIME_EVERY_MS)
    return () => clearInterval(t)
  }, [newestId, newestAt, play])

  if (!alerting) return null

  const fmtTime = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  const ago = (iso: string) => {
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
    if (s < 45) return 'just now'
    const m = Math.round(s / 60)
    return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
  }

  async function onMyWay() {
    if (!alerting) return
    const { token, rings } = alerting
    setAcking(true)
    // Hide at once; the re-read confirms (or brings it back if the ack failed).
    setHidden((prev) => new Set([...prev, ...rings.map((r) => r.ringId)]))
    await Promise.all(rings.map((r) => fetch(`/api/door/display/${token}/rings/${r.ringId}/ack`, { method: 'POST' }).catch(() => null)))
    setAcking(false)
    void refresh(token)
  }

  function hide() {
    if (!alerting) return
    setHidden((prev) => new Set([...prev, ...alerting.rings.map((r) => r.ringId)]))
  }

  const back = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'

  return (
    <DoorAlertOverlay
      stationName={alerting.stationName}
      rings={alerting.rings}
      test={false}
      acking={acking}
      onMyWay={() => void onMyWay()}
      fmtTime={fmtTime}
      ago={ago}
      quiet={isQuietAlert(alerting.rings[0].createdAt, now)}
      onClear={hide}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <a
          href={`/door/display/${alerting.token}?from=${encodeURIComponent(back)}`}
          className="press flex min-h-12 w-full items-center justify-center rounded-2xl bg-white px-6 text-lg font-bold text-gray-900 ring-2 ring-black/10"
        >
          Open door screen
        </a>
        <button type="button" onClick={hide} className="press min-h-11 px-4 text-base font-semibold underline underline-offset-4">
          Hide — someone else has it
        </button>
      </div>
    </DoorAlertOverlay>
  )
}
