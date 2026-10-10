'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { submitScore, adminSetScore } from '@/actions/scores'
import { recordBracketScore } from '@/actions/brackets'
import { logScoreboardInstall, logScoreboardLaunch } from '@/actions/scoreboard-metrics'
import { detectPlatform, getDeviceId, isStandaloneLaunch } from '@/lib/scoreboard-device'
import { rubberband } from '@/lib/drag-physics'
import { toast } from 'sonner'
import { isNetworkError, isStaleBuildError, reloadIfStale } from '@/lib/action-errors'
import { Overlay, useRetained } from '@/components/ui/overlay'
import {
  CLOCK_LENGTH_PRESETS, displayMs, endTimeout, formatClock, freshClock, isClockOn, isExpired, isRunning,
  newPeriod, nextAlarm, readClock, resetClock, setLength, setMode, startTimeout, stopClock, timeoutRemaining,
  toggle as toggleClock, type ClockMode, type GameClock,
} from '@/lib/scoreboard-clock'

// ── Fieldday Scoreboard ────────────────────────────────────────────────────────
// A standalone, offline-capable scoreboard: tap or swipe up on a panel to +1, swipe down to −1.
// Event-sourced: every score change is an event; scores and completed sets are
// derived by folding the event list, so undo is a pop and the per-set history
// falls out for free (matching game_results.sets' {home, away}[] shape).

// `folded`: End match recorded the in-progress set too — Undo takes both back.
type ScoreEvent = { t: 'A' | 'B'; d: 1 | -1 } | { t: 'set' } | { t: 'end'; folded?: boolean }

type TeamMeta = { name: string; color: string }

// The only setting: how the board scores. Set formats (targets, best-of,
// win-by-2, deciding-set rules) are deliberately NOT modelled — the scorekeeper
// ends a set or the match when it's over, so any house rule just works.
type Config = {
  mode: 'free' | 'sets'
}

type SavedGame = {
  v: 1
  events: ScoreEvent[]
  teamA: TeamMeta
  teamB: TeamMeta
  config: Config
  swapped: boolean
  updatedAt: number
  /** Game clock + timeouts (lib/scoreboard-clock). Absent on older boards. */
  clock?: GameClock
}

// Attached mode: the board is scoring a real Fieldday game (kind 'game') or a
// playoff bracket match (kind 'bracket'). Team A is always the home team /
// slot 1 so the saved result's orientation is never wrong.
export type AttachedGame = {
  kind: 'game' | 'bracket'
  gameId: string // games.id, or bracket_matches.id for kind 'bracket'
  bracketId: string | null
  leagueId: string
  leagueSlug: string
  leagueName: string
  court: string | null
  setSport: boolean
  home: { name: string; color: string | null }
  away: { name: string; color: string | null }
  canSave: 'admin' | 'captain' | null
  resultStatus: string | null
}

const STORAGE_KEY = 'fieldday-scoreboard-v1'
/** Adoption metrics fire once per browser session, not once per render. */
const LAUNCH_LOGGED_KEY = 'fieldday-scoreboard-launch-logged'

const COLORS = ['#0E9F6E', '#2563EB', '#DC2626', '#EA580C', '#7C3AED', '#DB2777', '#0891B2', '#475569']

const DEFAULTS: SavedGame = {
  v: 1,
  events: [],
  teamA: { name: 'HOME', color: COLORS[0] },
  teamB: { name: 'AWAY', color: COLORS[1] },
  config: { mode: 'free' },
  swapped: false,
  updatedAt: 0,
}

function attachedDefaults(att: AttachedGame): SavedGame {
  return {
    ...DEFAULTS,
    teamA: { name: att.home.name, color: att.home.color ?? COLORS[0] },
    teamB: { name: att.away.name, color: att.away.color ?? COLORS[1] },
    config: { mode: att.setSport ? 'sets' : 'free' },
  }
}

function load(key: string, att: AttachedGame | null): SavedGame {
  const base = att ? attachedDefaults(att) : DEFAULTS
  let merged = base
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as SavedGame
      if (parsed?.v === 1 && Array.isArray(parsed.events)) merged = { ...base, ...parsed }
    }
  } catch {
    merged = base
  }
  // Attached set-sport games are ALWAYS in sets mode — a volleyball result
  // saved from free mode records raw points with no set line, which corrupts
  // set-based standings. Also heals slots stuck in free mode from before.
  if (att?.setSport && merged.config.mode !== 'sets') {
    merged = { ...merged, config: { ...merged.config, mode: 'sets' } }
  }
  return merged
}

function derive(events: ScoreEvent[]) {
  const sets: { home: number; away: number }[] = []
  let a = 0
  let b = 0
  let over = false
  for (const e of events) {
    if (e.t === 'set') {
      sets.push({ home: a, away: b })
      a = 0
      b = 0
    } else if (e.t === 'end') {
      over = true
    } else if (e.t === 'A') {
      a = Math.max(0, a + e.d)
    } else {
      b = Math.max(0, b + e.d)
    }
  }
  return { a, b, sets, over }
}

export function ScoreboardApp({ attached = null }: { attached?: AttachedGame | null }) {
  const [game, setGame] = useState<SavedGame>(attached ? attachedDefaults(attached) : DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editTeam, setEditTeam] = useState<'A' | 'B' | null>(null)
  // Keeps the team on screen while the edit sheet animates out.
  const shownTeam = useRetained(editTeam)
  const [flash, setFlash] = useState<'A' | 'B' | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Why the last save failed: a server refusal (shown as-is) vs no connection
  // (retried automatically when the phone comes back online).
  const [saveError, setSaveError] = useState<{ message: string | null; offline: boolean } | null>(null)
  // Pocket lock: ignores panel taps until unlocked with a hold.
  const [locked, setLocked] = useState(false)
  const lockedRef = useRef(false)
  useEffect(() => { lockedRef.current = locked }, [locked])
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  // Post-"End set" chooser (play on vs end match) — auto-dismisses; play-on is
  // the default because the set is already recorded.
  const [setPrompt, setSetPrompt] = useState<{ n: number; home: number; away: number } | null>(null)
  const setPromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True only when the scorekeeper ended the match THIS session — gates the
  // auto-save so reloading an already-ended board never re-submits (a captain
  // re-submit would knock a confirmed result back to pending).
  const [justEnded, setJustEnded] = useState(false)
  // Latest game for async code: a save that resolves after the scorekeeper
  // pressed Undo must not report "Saved" over a score the server never got.
  const gameRef = useRef(game)
  useEffect(() => { gameRef.current = game }, [game])
  // Bumped when a save finished against an older version of the board, so
  // the auto-save runs again for the current one.
  const [resaveTick, setResaveTick] = useState(0)
  const [installed, setInstalled] = useState(false)
  const [installHelp, setInstallHelp] = useState(false)

  // Capture Chrome's install prompt at the app level so BOTH the one-time hint
  // and the menu's "Add to home screen" button can fire it — even after the
  // hint was dismissed, and even from fullscreen.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      // Adoption metrics — anonymous, best-effort, never blocks the board.
      const deviceId = getDeviceId()
      if (deviceId) void logScoreboardInstall({ deviceId, platform: detectPlatform() })
    }
    window.addEventListener('appinstalled', onInstalled)
    // Already-installed check: display-mode also reports 'fullscreen' during
    // the in-page Fullscreen API, so fullscreenElement disambiguates. At mount
    // no API fullscreen can be active, making this a pure install check.
    setInstalled(
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches && !document.fullscreenElement
    )
    // One launch per browser session: how many devices open the scoreboard, and
    // how many of those opened it from the home screen (the only iOS install
    // signal — Safari never fires appinstalled).
    try {
      if (!sessionStorage.getItem(LAUNCH_LOGGED_KEY)) {
        sessionStorage.setItem(LAUNCH_LOGGED_KEY, '1')
        const deviceId = getDeviceId()
        if (deviceId) {
          void logScoreboardLaunch({ deviceId, standalone: isStandaloneLaunch(), platform: detectPlatform() })
        }
      }
    } catch { /* storage unavailable — skip metrics, never the board */ }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Each attached game gets its own storage slot; the standalone board keeps its own.
  const storageKey = attached
    ? `${STORAGE_KEY}:${attached.kind === 'bracket' ? 'match' : 'game'}:${attached.gameId}`
    : STORAGE_KEY
  // Set while a finished game still has to reach the server (offline, a
  // 502 mid-deploy, a reload for a new build) — survives the tab being killed.
  const pendingKey = `${storageKey}:pending-save`
  const markPending = (on: boolean) => {
    try { if (on) localStorage.setItem(pendingKey, '1'); else localStorage.removeItem(pendingKey) } catch { /* storage blocked */ }
  }

  // Load saved game once on mount (client only)
  useEffect(() => {
    setGame(load(storageKey, attached))
    setLoaded(true)
    // A finished game whose save never landed (tab killed, reload for a new
    // build): re-arm the auto-save so it goes through now.
    try {
      if (attached?.canSave && localStorage.getItem(`${storageKey}:pending-save`) === '1') setJustEnded(true)
    } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // Persist on every change — except a change that just came FROM storage
  // (another tab, or a back/forward restore), which would echo back and forth.
  const fromStorage = useRef(false)
  useEffect(() => {
    if (!loaded) return
    if (fromStorage.current) { fromStorage.current = false; return }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...game, updatedAt: Date.now() }))
    } catch {
      // storage full/unavailable — scoreboard still works, just won't survive reload
    }
  }, [game, loaded, storageKey])

  // The same board open in two tabs, or a page restored from the back/forward
  // cache, used to write its OLDER events over the newer ones on its next
  // change. Follow the newest stored copy instead.
  useEffect(() => {
    if (!loaded) return
    const adoptStored = () => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return
        const stored = JSON.parse(raw) as SavedGame
        if (!stored?.events || stored.updatedAt <= (gameRef.current.updatedAt ?? 0)) return
        fromStorage.current = true
        setGame(load(storageKey, attached))
      } catch { /* unreadable — keep what's on screen */ }
    }
    const onStorage = (e: StorageEvent) => { if (e.key === storageKey) adoptStored() }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) adoptStored() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onShow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, storageKey])

  // Screen wake lock, re-acquired when the tab becomes visible again
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null
    async function acquire() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release?: () => Promise<void> }> } }
        lock = (await nav.wakeLock?.request('screen')) ?? null
      } catch {
        // denied / unsupported — nothing to do
      }
    }
    acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release?.().catch(() => {})
    }
  }, [])

  // Offline shell: register the scoped service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // The worker starts AFTER this page loaded, so the first visit's page and
      // chunks never went through it — the board needed two online visits
      // before it opened offline (an iPhone home-screen app's first launch at
      // a gym with no signal failed). Hand it what this page already loaded.
      // Post to THIS registration's worker: on org hosts the root /sw.js is
      // usually already active, and serviceWorker.ready resolved with it.
      const handOff = (w: ServiceWorker | null | undefined) => {
        if (!w) return
        const urls = performance.getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin + '/_next/static/') || u.startsWith(location.origin + '/scoreboard'))
        w.postMessage({ type: 'cache-urls', urls: [location.pathname + location.search, ...urls] })
      }
      navigator.serviceWorker.register('/scoreboard-sw.js', { scope: '/scoreboard' }).then((reg) => {
        if (reg.active) { handOff(reg.active); return }
        const w = reg.installing ?? reg.waiting
        w?.addEventListener('statechange', () => { if (w.state === 'activated') handOff(reg.active ?? w) })
      }).catch(() => {})
    }
  }, [])

  // No pull-to-refresh / rubber-band while the board is open: overscroll-none
  // on the fixed board doesn't reach the page's own scroller, so a swipe that
  // started on the middle bar could reload the page mid-game.
  useEffect(() => {
    const h = document.documentElement
    const b = document.body
    const prev = [h.style.overscrollBehavior, b.style.overscrollBehavior]
    h.style.overscrollBehavior = 'none'
    b.style.overscrollBehavior = 'none'
    return () => { h.style.overscrollBehavior = prev[0]; b.style.overscrollBehavior = prev[1] }
  }, [])

  // ── Live broadcast to gym TVs (V3) ──────────────────────────────────────────
  // The authorized scorer's board publishes its state on the event's Realtime
  // channel — ephemeral broadcast, no tables. TVs with a "Live Scores" zone on
  // this event render whatever boards are actively broadcasting.
  const broadcastChannel = useRef<RealtimeChannel | null>(null)
  useEffect(() => {
    if (!attached?.canSave || !attached.leagueId) return
    const supabase = createClient()
    const channel = supabase.channel(`scoreboard:${attached.leagueId}`)
    channel.subscribe()
    broadcastChannel.current = channel
    return () => {
      broadcastChannel.current = null
      supabase.removeChannel(channel)
    }
  }, [attached?.canSave, attached?.leagueId])

  const { a, b, sets, over } = useMemo(() => derive(game.events), [game.events])
  const setsWonA = sets.filter((s) => s.home > s.away).length
  const setsWonB = sets.filter((s) => s.away > s.home).length
  // The scorekeeper declares the end — 'tie' is legal for regular games
  // (two-set timeslot leagues); bracket saves still refuse it.
  const matchWinner: 'A' | 'B' | 'tie' | null = over
    ? setsWonA > setsWonB ? 'A' : setsWonB > setsWonA ? 'B' : 'tie'
    : null

  // ── Game clock + timeouts (lib/scoreboard-clock — the native app's twin) ──
  // Off by default. Nothing ends on its own at 0:00: the bar offers
  // "Time · End set / End match". Undo never touches the clock.
  const clock = readClock(game.clock)
  const changeClock = useCallback((fn: (c: GameClock, now: number) => GameClock) => {
    setGame((g) => ({ ...g, clock: fn(readClock(g.clock), Date.now()) }))
  }, [])
  const [now, setNow] = useState(() => Date.now())
  const ticking = clock.runningSince != null || !!clock.timeout
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [ticking])
  const [clockSheet, setClockSheet] = useState(false)
  const [timeUpDismissedFor, setTimeUpDismissedFor] = useState<number | null>(null)
  const horn = useRef<HTMLAudioElement | null>(null)
  const playHorn = () => {
    try {
      const a = horn.current ?? (horn.current = new Audio('/scoreboard-horn.wav'))
      a.muted = false
      a.currentTime = 0
      void a.play().catch(() => {})
    } catch {}
  }
  // iOS lets a page play sound only after it has played from a tap: prime
  // the horn, muted, on the tap that starts the clock or a timeout.
  const primeHorn = () => {
    if (!clock.sound) return
    try {
      const a = horn.current ?? (horn.current = new Audio('/scoreboard-horn.wav'))
      a.muted = true
      void a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false }).catch(() => { a.muted = false })
    } catch {}
  }
  // The buzzer: wait for the next zero (countdown or timeout) and fire.
  const alarmAt = nextAlarm(clock, now)
  useEffect(() => {
    if (alarmAt == null) return
    const id = setTimeout(() => {
      setNow(Date.now())
      try { navigator.vibrate?.([300, 150, 300, 150, 300]) } catch {}
      if (readClock(gameRef.current.clock).sound) playHorn()
    }, Math.max(0, alarmAt - Date.now()) + 30)
    return () => clearTimeout(id)
  }, [alarmAt])
  const clockOn = isClockOn(clock)
  const timeUp = clock.mode === 'countdown' && clock.runningSince != null && isExpired(clock, now)
    && clock.runningSince !== timeUpDismissedFor && !clock.timeout && !over

  // Send the board state on every change plus a 15s heartbeat, so a TV that
  // joins mid-game picks the board up within one beat. TVs expire boards that
  // go quiet, so closing the scoreboard takes it off the wall by itself.
  useEffect(() => {
    if (!attached?.canSave) return
    const send = () => {
      broadcastChannel.current?.send({
        type: 'broadcast',
        event: 'score',
        payload: {
          gameId: attached.gameId,
          court: attached.court,
          mode: game.config.mode,
          teamA: { name: game.teamA.name, color: game.teamA.color },
          teamB: { name: game.teamB.name, color: game.teamB.color },
          a,
          b,
          setsWonA,
          setsWonB,
          setNumber: sets.length + 1,
          final: over,
          ts: Date.now(),
        },
      })
    }
    send()
    const heartbeat = setInterval(send, 15000)
    return () => clearInterval(heartbeat)
  }, [attached, a, b, setsWonA, setsWonB, sets.length, over, game.config.mode, game.teamA, game.teamB])

  // Any change after a save re-arms saving: a save left the state at 'saved',
  // so Undo → fix → End match never re-saved, while the board still said
  // "✓ Saved as final" over the old score.
  const push = useCallback((e: ScoreEvent) => {
    setGame((g) => ({ ...g, events: [...g.events, e] }))
    setSaveState((st) => (st === 'saving' ? st : 'idle'))
  }, [])

  const undo = useCallback(() => {
    setGame((g) => {
      const last = g.events[g.events.length - 1]
      // An End match that folded the in-progress set: take both back, so the
      // set isn't left recorded as finished.
      const n = last && last.t === 'end' && last.folded ? 2 : 1
      return { ...g, events: g.events.slice(0, -n) }
    })
    setSetPrompt(null)
    setSaveState((st) => (st === 'saving' ? st : 'idle'))
  }, [])

  const score = useCallback(
    (team: 'A' | 'B', d: 1 | -1) => {
      if (matchWinner || lockedRef.current) return
      push({ t: team, d })
      if (d === 1) {
        setFlash(team)
        setTimeout(() => setFlash(null), 180)
      }
      try {
        navigator.vibrate?.(d === 1 ? 30 : 15)
      } catch {
        // iOS Safari has no vibration API
      }
    },
    [matchWinner, push]
  )

  // ── Panel gestures: tap / swipe up = +1, swipe down = −1, long-press = edit team ──
  const gesture = useRef<{ id: number; y: number; x: number; ts: number; team: 'A' | 'B'; longPress: ReturnType<typeof setTimeout>; consumed: boolean } | null>(null)

  // ── Live feedback while a finger is down (visual only — scoring is still
  // decided in onPointerUp, unchanged). Apple's rule: respond on touch-down,
  // track continuously, hint where the gesture is going. Written straight to
  // the DOM through refs so a drag doesn't re-render the whole board.
  //   shade — the panel darkens the instant it's touched
  //   num   — the score follows a vertical swipe (1:1 to the threshold, then
  //           rubber-bands), springing back if released short
  //   hint  — "−1" (pull down) / "+1" (push up) fades in and firms up once it
  //           will count
  //   ring  — fills at the finger during a hold, completing at the long-press
  const SWIPE_COMMIT = 40
  // An upward move past the tap slop already counts (+1): a tap that drifted
  // up used to score nothing. Down needs the full SWIPE_COMMIT (−1 is costly).
  const TAP_SLOP = 14
  type Fx = { shade: HTMLDivElement | null; num: HTMLParagraphElement | null; hint: HTMLDivElement | null; hintUp: HTMLDivElement | null; ring: HTMLDivElement | null; ringTimer?: ReturnType<typeof setTimeout>; armed?: boolean }
  const fx = useRef<Record<'A' | 'B', Fx>>({ A: { shade: null, num: null, hint: null, hintUp: null, ring: null }, B: { shade: null, num: null, hint: null, hintUp: null, ring: null } })
  const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const pressFx = (team: 'A' | 'B', e: React.PointerEvent) => {
    const f = fx.current[team]
    if (f.shade) { f.shade.style.transition = 'none'; f.shade.style.opacity = '1' }
    f.armed = false
    clearTimeout(f.ringTimer)
    const ring = f.ring
    if (ring) {
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
      ring.style.left = `${e.clientX - box.left}px`
      ring.style.top = `${e.clientY - box.top}px`
      ring.dataset.state = 'idle'
      // Only a deliberate hold shows the ring — a tap is over long before this.
      f.ringTimer = setTimeout(() => { ring.dataset.state = 'filling' }, 200)
    }
  }

  const dragFx = (team: 'A' | 'B', dy: number, dx: number) => {
    const f = fx.current[team]
    if (Math.abs(dy) > 12 || dx > 12) {
      clearTimeout(f.ringTimer)
      if (f.ring) f.ring.dataset.state = 'idle'
    }
    const pulling = dy > 0 && dy > dx
    const pushing = dy < 0 && -dy > dx
    const dist = Math.abs(dy)
    const follow = dist <= SWIPE_COMMIT ? dist : SWIPE_COMMIT + rubberband(dist - SWIPE_COMMIT, 240)
    const offset = pulling ? follow : pushing ? -follow : 0
    if (f.num && !reduceMotion()) {
      f.num.style.transition = 'none'
      f.num.style.transform = `translateY(${offset}px)`
    }
    const willCount = (pulling && dy > SWIPE_COMMIT) || (pushing && -dy > TAP_SLOP)
    if (f.hint) {
      f.hint.style.opacity = String(pulling ? Math.min(1, dy / SWIPE_COMMIT) : 0)
      f.hint.dataset.armed = pulling && willCount ? 'true' : 'false'
    }
    if (f.hintUp) {
      f.hintUp.style.opacity = String(pushing ? Math.min(1, -dy / SWIPE_COMMIT + 0.4) : 0)
      f.hintUp.dataset.armed = pushing && willCount ? 'true' : 'false'
    }
    if (willCount && !f.armed) {
      try { navigator.vibrate?.(8) } catch {}
    }
    f.armed = willCount
  }

  const releaseFx = (team: 'A' | 'B') => {
    const f = fx.current[team]
    clearTimeout(f.ringTimer)
    if (f.ring) f.ring.dataset.state = 'idle'
    if (f.shade) { f.shade.style.transition = 'opacity 200ms ease-out'; f.shade.style.opacity = '0' }
    if (f.num) {
      f.num.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)'
      f.num.style.transform = ''
    }
    if (f.hint) { f.hint.style.opacity = '0'; f.hint.dataset.armed = 'false' }
    if (f.hintUp) { f.hintUp.style.opacity = '0'; f.hintUp.dataset.armed = 'false' }
    f.armed = false
  }

  const onPointerDown = (team: 'A' | 'B') => (e: React.PointerEvent) => {
    if (lockedRef.current) return
    if (gesture.current) {
      // A second simultaneous finger is ignored — but a gesture whose pointerup
      // never arrived (pointer lost mid-press) must not lock the board forever.
      if (Date.now() - gesture.current.ts < 1200) return
      clearTimeout(gesture.current.longPress)
      gesture.current = null
    }
    const longPress = setTimeout(() => {
      if (gesture.current?.id === e.pointerId) {
        gesture.current.consumed = true
        setEditTeam(team)
        try {
          navigator.vibrate?.(15)
        } catch {}
      }
    }, 550)
    gesture.current = { id: e.pointerId, y: e.clientY, x: e.clientX, ts: Date.now(), team, longPress, consumed: false }
    pressFx(team, e)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    // Real movement cancels the long-press
    if (Math.abs(e.clientY - g.y) > 12 || Math.abs(e.clientX - g.x) > 12) clearTimeout(g.longPress)
    if (!g.consumed) dragFx(g.team, e.clientY - g.y, Math.abs(e.clientX - g.x))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    clearTimeout(g.longPress)
    gesture.current = null
    releaseFx(g.team)
    if (g.consumed) return
    const dy = e.clientY - g.y
    const dx = Math.abs(e.clientX - g.x)
    if (dy > SWIPE_COMMIT && dy > dx) {
      score(g.team, -1) // swipe down
    } else if (dy < -TAP_SLOP && -dy > dx) {
      score(g.team, 1) // swipe up
    } else if (Math.abs(dy) < TAP_SLOP && dx < TAP_SLOP && Date.now() - g.ts < 500) {
      score(g.team, 1) // tap
    }
  }

  const onPointerCancel = () => {
    if (gesture.current) {
      clearTimeout(gesture.current.longPress)
      releaseFx(gesture.current.team)
    }
    gesture.current = null
  }

  const reset = () => {
    // A new game starts with a fresh clock; its settings stay.
    setGame((g) => ({ ...g, events: [], clock: freshClock(readClock(g.clock)) }))
    setSaveState('idle')
    setMenuOpen(false)
  }

  // No "Are you sure?" — reset at once and offer Undo. Undo only restores
  // into a still-empty board, so it never clobbers points scored since.
  const resetWithUndo = () => {
    const previous = game.events
    reset()
    if (previous.length === 0) return
    toast('Scores reset', {
      action: {
        label: 'Undo',
        onClick: () => setGame((g) => (g.events.length === 0 ? { ...g, events: previous } : g)),
      },
    })
  }

  // The scorekeeper declares set and match ends — no targets to model, so any
  // house format (caps, time limits, golden point, fixed two-set nights) works.
  const endSet = () => {
    if (a + b === 0 || over) return
    const recorded = { n: sets.length + 1, home: a, away: b }
    push({ t: 'set' })
    // The next set or half starts with a fresh countdown and no timeouts.
    changeClock((c) => newPeriod(c))
    try {
      navigator.vibrate?.(20)
    } catch {}
    // Offer "end match" right here so finishing a match never needs the menu.
    setSetPrompt(recorded)
    if (setPromptTimer.current) clearTimeout(setPromptTimer.current)
    setPromptTimer.current = setTimeout(() => setSetPrompt(null), 6000)
  }

  const endMatch = () => {
    setGame((g) => {
      const cur = derive(g.events)
      if (cur.over) return g
      const events: ScoreEvent[] = [...g.events]
      const folded = cur.a + cur.b > 0
      if (folded) events.push({ t: 'set' }) // fold the in-progress set
      events.push(folded ? { t: 'end', folded: true } : { t: 'end' })
      return { ...g, events, clock: stopClock(readClock(g.clock), Date.now()) }
    })
    setSetPrompt(null)
    setJustEnded(true)
    setMenuOpen(false)
    setSaveState((st) => (st === 'saving' ? st : 'idle'))
  }

  // What a save will record. In sets mode an in-progress set with points is
  // folded into the set line (and counts for whoever leads) — otherwise saving
  // mid-set silently drops those points, which is how sets went missing.
  const isSets = game.config.mode === 'sets'
  const effectiveSets = isSets ? [...sets, ...(a + b > 0 ? [{ home: a, away: b }] : [])] : []
  const effHome = isSets ? effectiveSets.filter((s) => s.home > s.away).length : a
  const effAway = isSets ? effectiveSets.filter((s) => s.away > s.home).length : b
  const setLinePreview = isSets ? effectiveSets.map((s) => `${s.home}–${s.away}`).join('  ') : null

  // A captain's board on an already-CONFIRMED game never saves (the server
  // refuses too); an admin's save replaces the confirmed result.
  const confirmedLock = attached?.canSave === 'captain' && attached.resultStatus === 'confirmed'
  const canSave = confirmedLock ? null : attached?.canSave ?? null

  // Where "done" leads for an attached board: admins loop back to Courtside,
  // everyone else returns to the event page.
  const exitHref = attached ? (attached.canSave === 'admin' ? '/admin/courtside' : `/events/${attached.leagueSlug}`) : null
  const exitLabel = attached?.canSave === 'admin' ? 'Courtside' : 'Event page'

  // Standalone boards opened from the site menu need a way back too — history
  // when there is one, the site home otherwise. Hidden when the board runs as
  // an installed app (the scoreboard IS the app there; nowhere to go "back").
  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.href = '/'
  }
  const showStandaloneBack = !attached && !installed

  // Attached mode: push the result through the normal pipeline — admins save
  // confirmed (adminSetScore), captains submit pending (submitScore, opponent
  // confirms), bracket matches go through recordBracketScore (admin-only,
  // advances the winner). Set sports save sets-won as the match score plus the
  // per-set line, matching AdminScoreEntry's convention.
  const saveResult = async () => {
    if (!attached || !canSave) return
    const snapshot = game.events
    setSaveState('saving')
    setSaveError(null)
    const setLine = isSets && effectiveSets.length > 0 ? effectiveSets : undefined
    try {
      if (attached.kind === 'bracket') {
        if (effHome === effAway) throw new Error('tie') // bracket matches need a winner
        const res = await recordBracketScore({
          matchId: attached.gameId,
          bracketId: attached.bracketId!,
          leagueId: attached.leagueId,
          score1: effHome,
          score2: effAway,
          sets: setLine?.map((s) => ({ s1: s.home, s2: s.away })),
        })
        if (res?.error) throw new Error(res.error)
      } else {
        const res =
          attached.canSave === 'admin'
            ? await adminSetScore({ gameId: attached.gameId, leagueId: attached.leagueId, homeScore: effHome, awayScore: effAway, sets: setLine })
            : await submitScore({ gameId: attached.gameId, homeScore: effHome, awayScore: effAway, sets: setLine })
        if (res?.error) throw new Error(res.error)
      }
      markPending(false)
      // Undo / a re-end while the request was in flight: what was saved is
      // no longer the board. Go round again with the current score.
      if (gameRef.current.events !== snapshot) {
        setSaveState('idle')
        setResaveTick((t) => t + 1)
        return
      }
      setSaveState('saved')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // A tab from before a deploy: the action id is gone. Reload (the board
      // is in localStorage) and the pending flag saves it on the new build.
      if (isStaleBuildError(err)) {
        markPending(true)
        if (reloadIfStale(err)) return
      }
      // fetch/server-action transport failures (incl. a 5xx mid-deploy) vs a
      // refusal from the server ("Not authenticated", "already confirmed", …).
      const offline = isNetworkError(err) || isStaleBuildError(err)
      if (offline) markPending(true)
      setSaveError({ message: offline || msg === 'tie' ? null : msg || null, offline })
      setSaveState('error')
    }
  }

  // Back online after a failed save → try again by itself.
  // Gym wifi that's "connected" but passes nothing never fires `online`, so
  // also retry when the screen comes back and every 20s.
  useEffect(() => {
    if (saveState !== 'error' || !saveError?.offline) return
    const retry = () => { void saveResult() }
    const onVisible = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(retry, 20_000)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, saveError])



  // One less tap: ending the match saves it (admins → confirmed final,
  // captains → submitted for the opponent to confirm). Fires only for an End
  // match tapped this session; a failed save falls back to the manual button.
  useEffect(() => {
    if (justEnded && over && canSave && saveState === 'idle') {
      saveResult()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justEnded, over, resaveTick])

  const saveButton = (className: string) =>
    attached && confirmedLock ? (
      <p className="text-sm text-white/80 max-w-[260px] text-center">
        This game&apos;s score is already confirmed, so this board won&apos;t change it. Ask an organiser if it needs fixing.
      </p>
    ) : attached && canSave ? (
      <div className="flex flex-col items-center gap-1.5">
        {setLinePreview && saveState !== 'saved' && (
          <p className="text-xs text-white/50 tabular-nums">
            Will save {effHome}–{effAway} · sets {setLinePreview}
          </p>
        )}
        <button onClick={saveResult} disabled={saveState === 'saving' || saveState === 'saved'} className={className}>
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
            ? canSave === 'admin'
              ? '✓ Saved as final'
              : '✓ Submitted — opponent confirms'
            : canSave === 'admin'
            ? attached.resultStatus === 'confirmed' ? 'Replace confirmed score' : 'Save final score'
            : 'Submit score'}
        </button>
        {saveState === 'saved' && exitHref && (
          <a href={exitHref} className="px-6 py-3 rounded-xl bg-white text-gray-900 font-bold">
            Done — back to {exitLabel} →
          </a>
        )}
        {saveState === 'error' && (
          <p className="text-xs text-red-300 max-w-[240px] text-center">
            {attached.kind === 'bracket' && effHome === effAway
              ? 'Bracket matches need a winner — break the tie before saving.'
              : saveError?.message
              ? <>
                  {saveError.message}
                  {/auth/i.test(saveError.message) && (
                    <> <a className="underline" href={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in again</a> — the score stays on this device.</>
                  )}
                </>
              : 'No connection — the score is safe on this device and will save when you’re back online.'}
          </p>
        )}
      </div>
    ) : null

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  // "Add to home screen" from the menu. Chrome can pop the real install
  // dialog; iOS has no API for it, so it gets the Share-menu instructions —
  // either way, leave in-page fullscreen first so the browser chrome (and on
  // iOS the Share button) is visible.
  const requestInstall = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    if (installPrompt) {
      setMenuOpen(false)
      const evt = installPrompt
      setInstallPrompt(null) // the captured event is single-use
      try {
        evt.prompt()
        const choice = await evt.userChoice
        if (choice?.outcome === 'accepted') setInstalled(true)
      } catch {
        // prompt already consumed or blocked — show the manual instructions
        setInstallHelp(true)
        setMenuOpen(true)
      }
    } else {
      // No install event (yet) — open the menu with platform instructions
      setInstallHelp(true)
      setMenuOpen(true)
    }
  }

  if (!loaded) return <div className="fixed inset-0 bg-[#0B1210]" />

  // Display order honours side swaps; scores stay keyed to the real teams.
  const first: 'A' | 'B' = game.swapped ? 'B' : 'A'
  const second: 'A' | 'B' = game.swapped ? 'A' : 'B'

  const panel = (team: 'A' | 'B') => {
    const meta = team === 'A' ? game.teamA : game.teamB
    const pts = team === 'A' ? a : b
    const won = team === 'A' ? setsWonA : setsWonB
    return (
      <div
        key={team}
        role="group"
        aria-label={`${meta.name}, ${pts} ${pts === 1 ? 'point' : 'points'}`}
        className="relative flex-1 flex flex-col items-center justify-center select-none overflow-hidden"
        style={{ background: `linear-gradient(180deg, ${meta.color}, color-mix(in srgb, ${meta.color} 72%, black))`, touchAction: 'none' }}
        onPointerDown={onPointerDown(team)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Touch-down shade, swipe hint and hold ring — driven by pressFx /
            dragFx / releaseFx; purely visual, hidden from assistive tech. */}
        <div ref={(el) => { fx.current[team].shade = el }} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/15 opacity-0" />
        <div ref={(el) => { fx.current[team].hint = el }} aria-hidden="true" data-armed="false" className="sb-swipe-hint pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 opacity-0 rounded-full px-4 py-1.5 text-lg font-bold tabular-nums text-white">
          −1
        </div>
        <div ref={(el) => { fx.current[team].hintUp = el }} aria-hidden="true" data-armed="false" className="sb-swipe-hint pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 rounded-full px-4 py-1.5 text-lg font-bold tabular-nums text-white">
          +1
        </div>
        <div ref={(el) => { fx.current[team].ring = el }} aria-hidden="true" data-state="idle" className="sb-hold-ring pointer-events-none absolute w-20 h-20 -ml-10 -mt-10">
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
            <circle className="sb-hold-ring__arc" cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" pathLength="100" strokeDasharray="100" />
          </svg>
        </div>
        <p className="text-white/85 font-bold uppercase tracking-[0.14em] text-sm sm:text-base px-4 text-center truncate max-w-full">
          {meta.name}
        </p>
        {clockOn && clock.timeoutsUsed[team] > 0 && (
          <p className="flex items-center gap-1 text-[11px] font-extrabold text-white/80" aria-label={`${clock.timeoutsUsed[team]} timeout${clock.timeoutsUsed[team] === 1 ? '' : 's'} taken`}>
            T/O
            {Array.from({ length: clock.timeoutsUsed[team] }, (_, i) => (
              <span key={i} aria-hidden="true" className="w-[7px] h-[7px] rounded-full border-[1.5px] border-white" />
            ))}
          </p>
        )}
        {/* The outer <p> carries the swipe offset (direct style writes); the
            inner span keeps the +1 pulse, so the two transforms never fight. */}
        <p ref={(el) => { fx.current[team].num = el }} className="text-white font-bold leading-none tabular-nums" style={{ fontSize: 'min(34vh, 38vw)' }}>
          <span
            className="inline-block transition-transform duration-150"
            style={{ transform: flash === team ? 'scale(1.06)' : 'scale(1)', textShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
          >
            {pts}
          </span>
        </p>
        {game.config.mode === 'sets' && won > 0 && (
          <div className="flex gap-1.5 mt-1" role="img" aria-label={`${won} ${won === 1 ? 'set' : 'sets'} won`}>
            {Array.from({ length: won }, (_, i) => (
              <span key={i} className="w-2.5 h-2.5 rounded-full bg-white" />
            ))}
          </div>
        )}

        {/* The accessible path. Tapping the panel is still the fast route for
            touch, but tap, swipe-down and long-press have no keyboard or
            switch equivalent, so these buttons are the only way the board can
            be operated without a pointer. They are real buttons, which is why
            the panel around them is a group rather than a button — a button
            must not contain interactive descendants. Kept faint so the
            courtside read stays uncluttered; they come forward on focus. */}
        {/* In the panel's bottom corners, away from the centre where thumbs
            tap for +1 (centred under the score, a quick tap could land on −). */}
        <div className="absolute bottom-3 inset-x-3 flex justify-between pointer-events-none">
          {([['−', -1, 'Remove a point from'], ['+', 1, 'Add a point to']] as const).map(([glyph, delta, verb]) => (
            <button
              key={glyph}
              type="button"
              aria-label={`${verb} ${meta.name}`}
              className="pointer-events-auto w-11 h-11 rounded-full bg-white/15 text-white text-2xl leading-none font-bold opacity-45 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition-opacity"
              // Keep the panel's gesture machine out of it: a press here is a
              // button press, never a tap on the panel behind it.
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); score(team, delta) }}
            >
              {glyph}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0B1210] flex flex-col portrait:flex-col landscape:flex-row overscroll-none">
      {/* Score changes are otherwise silent to a screen reader: the number just
          swaps in place inside a control the user is still focused on. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {!editTeam && <>
          {game.teamA.name} {a}, {game.teamB.name} {b}
          {game.config.mode === 'sets' ? `. Sets ${setsWonA} to ${setsWonB}.` : '.'}
        </>}
      </p>
      {panel(first)}

      {/* Clock row (when the clock is on) + the middle bar, between the panels. */}
      <div className="shrink-0 flex flex-col landscape:justify-center bg-[#0B1210]">
      {clockOn && (
        <ClockRow
          clock={clock}
          now={now}
          teamA={game.teamA}
          teamB={game.teamB}
          order={[first, second]}
          locked={locked}
          over={over}
          timeUp={timeUp}
          setsMode={game.config.mode === 'sets'}
          canEndSet={a + b > 0}
          nextSet={sets.length + 1}
          onToggle={() => { primeHorn(); changeClock((c, t) => toggleClock(c, t)) }}
          onTimeout={(side) => { primeHorn(); changeClock((c, t) => startTimeout(c, side, t)) }}
          onResume={() => changeClock((c, t) => endTimeout(c, t))}
          onOpenSettings={() => setClockSheet(true)}
          onEndSet={endSet}
          onEndMatch={endMatch}
          onDismissTimeUp={() => setTimeUpDismissedFor(clock.runningSince ?? null)}
        />
      )}
      {/* Middle bar — one row at 375px with the lock (gap-1, px-2.5); wraps
          only on narrower phones. */}
      <div className="flex flex-wrap landscape:flex-col items-center justify-center gap-1 px-2 py-1.5 landscape:px-1.5 landscape:py-2 bg-[#0B1210] text-[#9db3a9] shrink-0" style={{ touchAction: 'manipulation' }}>
        {/* Post-set chooser lives IN the middle bar (not over a scoring
            panel, where the next point's tap could land on End match). The
            set is already recorded; this only offers ending the match. */}
        {setPrompt && !matchWinner ? (
          <>
            <p className="text-xs text-white/90 whitespace-nowrap" role="status">
              <span className="font-bold">Set {setPrompt.n}</span>{' '}
              <span className="tabular-nums">{setPrompt.home}–{setPrompt.away}</span> ✓
            </p>
            <button
              onClick={() => setSetPrompt(null)}
              className="inline-flex items-center justify-center min-h-10 px-4 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-semibold whitespace-nowrap"
            >
              Play on
            </button>
            <button
              onClick={endMatch}
              className="inline-flex items-center justify-center min-h-10 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap"
            >
              🏁 End match{canSave ? ' & save' : ''}
            </button>
          </>
        ) : locked ? (
          <HoldToUnlock onUnlock={() => setLocked(false)} />
        ) : (
          <>
        {exitHref ? (
          <a
            href={exitHref}
            aria-label={`Back to ${exitLabel}`}
            className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            ←
          </a>
        ) : showStandaloneBack ? (
          <button
            onClick={goBack}
            aria-label="Back to site"
            className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            ←
          </button>
        ) : null}
        {game.config.mode === 'sets' && (
          <button
            onClick={endSet}
            disabled={a + b === 0 || over}
            className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 disabled:bg-white/10 text-white transition-colors whitespace-nowrap"
            aria-label={`End set ${sets.length + 1}`}
          >
            End set {sets.length + 1}
          </button>
        )}
        <button
          onClick={undo}
          disabled={game.events.length === 0}
          className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-30 text-white transition-colors"
          aria-label="Undo last score change"
        >
          ↩ Undo
        </button>
        <button
          onClick={() => setGame((g) => ({ ...g, swapped: !g.swapped }))}
          className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          aria-label="Swap sides"
        >
          ⇄ Swap
        </button>
        <button
          onClick={() => setMenuOpen(true)}
          className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          aria-label="Menu"
        >
          ⋯
        </button>
        <button
          onClick={() => setLocked(true)}
          className="inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 min-w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          aria-label="Lock the board (ignore taps until unlocked)"
          title="Lock — for a phone in a pocket"
        >
          🔒
        </button>
          </>
        )}
      </div>
      </div>

      {panel(second)}

      {/* Only before scoring starts (and never on a locked board): it sat over
          the bottom panel's −/+ buttons, and on Android the card is a button. */}
      {!locked && game.events.length === 0 && (
        <InstallHint installPrompt={installPrompt} installed={installed} onInstall={requestInstall} />
      )}
      {!attached && <DetachedNotice />}

      {/* Match-over overlay — shown when the scorekeeper ends the match */}
      {matchWinner && (
        <MatchOverlay>
          <p className="text-4xl mb-2">{matchWinner === 'tie' ? '🤝' : '🏆'}</p>
          <p className="text-white text-2xl font-bold mb-1">
            {matchWinner === 'tie'
              ? `Match over — ${setsWonA}–${setsWonB}`
              : `${(matchWinner === 'A' ? game.teamA : game.teamB).name} win the match`}
          </p>
          <p className="text-white/60 text-lg tabular-nums mb-6">
            {sets.map((s) => `${s.home}–${s.away}`).join('  ')}
          </p>
          <div className="flex flex-col items-center gap-3">
            {saveButton('px-6 py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-60')}
            <div className="flex gap-3">
              {!attached && (
                <button onClick={resetWithUndo} className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">
                  New game
                </button>
              )}
              <button onClick={undo} className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">
                ↩ Undo
              </button>
            </div>
          </div>
        </MatchOverlay>
      )}

      {/* Team edit sheet — top-anchored so the phone keyboard never covers the fields */}
      <Sheet open={!!editTeam} onClose={() => setEditTeam(null)} title={`Edit ${shownTeam === 'A' ? 'first' : 'second'} team`} align="top">
        {shownTeam && (<>
          <label className="block text-xs text-white/60 mb-1">Team name</label>
          <input aria-label="Team name"
            data-autofocus
            value={(shownTeam === 'A' ? game.teamA : game.teamB).name}
            onChange={(e) =>
              setGame((g) => ({
                ...g,
                [shownTeam === 'A' ? 'teamA' : 'teamB']: { ...(shownTeam === 'A' ? g.teamA : g.teamB), name: e.target.value.slice(0, 24) },
              }))
            }
            className="w-full rounded-lg bg-white/10 text-white px-3 py-2.5 mb-4 outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <label className="block text-xs text-white/60 mb-2">Colour</label>
          <div className="flex flex-wrap gap-2.5 mb-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() =>
                  setGame((g) => ({
                    ...g,
                    [shownTeam === 'A' ? 'teamA' : 'teamB']: { ...(shownTeam === 'A' ? g.teamA : g.teamB), color: c },
                  }))
                }
                aria-label={`Colour ${c}`}
                aria-pressed={(shownTeam === 'A' ? game.teamA : game.teamB).color === c}
                className="w-9 h-9 rounded-full border-2"
                style={{ background: c, borderColor: (shownTeam === 'A' ? game.teamA : game.teamB).color === c ? 'white' : 'transparent' }}
              />
            ))}
          </div>
        </>)}
      </Sheet>

      {/* Menu sheet */}
      <Sheet open={clockSheet} onClose={() => setClockSheet(false)} title="Clock">
        <ClockSettings clock={clock} onChange={changeClock} />
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Scoreboard">
          <div className="space-y-4">
            {attached && (
              <div className="rounded-lg bg-white/5 px-3 py-2.5">
                <p className="text-xs text-white/50">
                  Scoring {game.teamA.name} vs {game.teamB.name}
                  {attached.leagueName ? ` · ${attached.leagueName}` : ''}
                </p>
                {attached.canSave ? (
                  <div className="mt-2">
                    {saveButton('w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-white disabled:opacity-60')}
                  </div>
                ) : (
                  <p className="text-[11px] text-white/35 mt-1">Score-only view — captains and admins can save results.</p>
                )}
              </div>
            )}
            {attached?.setSport ? (
              // Set sports always score in sets when attached — the league's
              // results and standings expect a set line, so no free mode here.
              <p className="text-xs text-white/50">
                Sets mode — this league records volleyball results set by set.
              </p>
            ) : (
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Scoring mode</label>
                <div className="flex gap-2">
                  {(['free', 'sets'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setGame((g) => ({ ...g, config: { ...g.config, mode: m } }))}
                      aria-pressed={game.config.mode === m}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${game.config.mode === m ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}`}
                    >
                      {m === 'free' ? 'Free score' : 'Sets'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-white/60 mb-1.5">Clock</label>
              <ClockSettings clock={clock} onChange={changeClock} />
            </div>

            {game.config.mode === 'sets' && (
              <button
                onClick={endMatch}
                disabled={over || game.events.length === 0}
                className="w-full py-2.5 rounded-lg text-sm font-bold bg-white/10 text-white/90 disabled:opacity-40"
              >
                🏁 End match
              </button>
            )}

            <div className="flex gap-2">
              {/* Close the menu first — both sheets are fixed overlays, and the
                  menu otherwise stays stacked over the edit sheet while the
                  autofocused input opens the keyboard (iOS bug report). */}
              <button
                onClick={() => { setMenuOpen(false); setEditTeam('A') }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80"
              >
                Edit {game.teamA.name}
              </button>
              <button
                onClick={() => { setMenuOpen(false); setEditTeam('B') }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80"
              >
                Edit {game.teamB.name}
              </button>
            </div>

            <div className="flex gap-2">
              {typeof document !== 'undefined' && 'requestFullscreen' in document.documentElement && (
                <button onClick={toggleFullscreen} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80">
                  ⛶ Fullscreen
                </button>
              )}
              <button
                onClick={resetWithUndo}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-500/20 text-red-300"
              >
                Reset game
              </button>
            </div>

            {exitHref ? (
              <a href={exitHref} className="block w-full text-center py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80">
                ← Back to {exitLabel}
              </a>
            ) : showStandaloneBack ? (
              <button onClick={goBack} className="w-full text-center py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80">
                ← Back to site
              </button>
            ) : null}

            {!installed && (
              <div>
                <button onClick={requestInstall} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80">
                  📲 Add to home screen
                </button>
                {installHelp && (
                  <p className="text-xs text-white/50 mt-2 leading-relaxed">
                    {isIosDevice()
                      ? 'iPhone/iPad: open this page in Safari, tap the Share button, then “Add to Home Screen”. The scoreboard installs fullscreen and works offline.'
                      : 'In your browser menu, choose “Install app” (or “Add to Home Screen”). The scoreboard installs fullscreen and works offline.'}
                  </p>
                )}
              </div>
            )}

            <p className="text-center text-xs text-white/40 pt-2">
              Tap or swipe up to score · swipe down to take one back · hold to edit
              <br />
              <a href="https://fielddayapp.ca" className="underline underline-offset-2 text-white/50">
                Powered by Fieldday
              </a>{' '}
              — free league management for community sports
            </p>
          </div>
      </Sheet>
    </div>
  )
}

// ── Detached notice ───────────────────────────────────────────────────────────
// The link was for a game (?game= / ?match=) but the board came up unattached —
// opened offline before that game's page was ever cached, so the worker served
// the plain board. Scores still count on screen but won't save to the game:
// say so before the scorekeeper finds out at the end.
const noSubscribe = () => () => {}
function linkWasForAGame() {
  const q = new URLSearchParams(window.location.search)
  return q.has('game') || q.has('match')
}
function DetachedNotice() {
  const wanted = useSyncExternalStore(noSubscribe, linkWasForAGame, () => false)
  const [dismissed, setDismissed] = useState(false)
  if (!wanted || dismissed) return null
  return (
    <div role="status" className="fixed left-3 right-3 z-30 flex justify-center pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
      <div className="pointer-events-auto flex items-start gap-3 max-w-md rounded-xl bg-amber-500 text-black px-4 py-3 shadow-lg">
        <p className="text-sm font-medium leading-snug">
          This game didn&apos;t load (no signal, or the link is out of date), so scores here won&apos;t be saved to it.
        </p>
        <button onClick={() => window.location.reload()} className="shrink-0 min-h-10 px-3 rounded-lg bg-black/80 text-white text-sm font-semibold">
          Reload
        </button>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 w-10 h-10 -mr-2 -my-1 flex items-center justify-center text-black/70 text-lg">
          ×
        </button>
      </div>
    </div>
  )
}

// ── Install hint ──────────────────────────────────────────────────────────────
// One-time nudge to add the scoreboard to the home screen. Hidden when the app
// is already installed (display-mode standalone/fullscreen), once dismissed,
// and until the page has settled. Chrome's beforeinstallprompt gives us a real
// Install button; iOS never prompts, so it gets the Share-menu instructions.

const HINT_DISMISSED_KEY = 'fieldday-scoreboard-install-hint'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }

// iPadOS reports as Mac; the touch check catches it.
function isIosDevice() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

function InstallHint({
  installPrompt,
  installed,
  onInstall,
}: {
  installPrompt: InstallPromptEvent | null
  installed: boolean
  onInstall: () => void
}) {
  const [show, setShow] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_DISMISSED_KEY)) return
    } catch {
      return
    }
    if (window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) return
    setIsIos(isIosDevice())
    const timer = setTimeout(() => setShow(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(HINT_DISMISSED_KEY, '1')
    } catch {}
  }

  if (!show || installed) return null

  // On non-iOS the WHOLE card installs (Chrome's native dialog when its
  // install event has arrived, otherwise the menu instructions) — the earlier
  // version only worked via a button that existed once the event had fired,
  // so an early tap on the message did nothing. iOS has no install API, so
  // there the card stays informational.
  const body = (
    <p className="text-xs text-white/85 leading-snug text-left">
      <span className="font-bold">Add to your home screen</span> — opens fullscreen and works offline.{' '}
      {isIos ? (
        <span className="text-white/60">Tap the Share button, then “Add to Home Screen”.</span>
      ) : (
        <span className="text-white/60">Tap here to install.</span>
      )}
    </p>
  )

  return (
    <div className="fixed bottom-3 left-3 right-3 z-30 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 max-w-md rounded-xl bg-black/80 backdrop-blur px-4 py-3 shadow-lg">
        {isIos ? (
          body
        ) : (
          <button
            onClick={() => {
              dismiss()
              onInstall()
            }}
            className="flex items-center gap-3 text-left"
          >
            {body}
            <span className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-500 text-white">
              {installPrompt ? 'Install' : 'How?'}
            </span>
          </button>
        )}
        <button onClick={dismiss} className="shrink-0 text-white/50 hover:text-white text-lg leading-none" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}

/** "Hold to unlock" — a deliberate 700ms press, so a pocket tap can't do it. */
function HoldToUnlock({ onUnlock }: { onUnlock: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDown = useRef(0)
  const [holding, setHolding] = useState(false)
  const start = () => {
    lastDown.current = Date.now()
    setHolding(true)
    timer.current = setTimeout(() => { setHolding(false); onUnlock() }, 700)
  }
  const cancel = () => {
    setHolding(false)
    if (timer.current) clearTimeout(timer.current)
  }
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onUnlock() }}
      // VoiceOver / TalkBack "double-tap" and switch access deliver a click
      // with no finger held down first: treat that as unlock. A real touch
      // still has to hold (the pointerdown just before makes it a tap).
      onClick={() => { if (Date.now() - lastDown.current > 1000) onUnlock() }}
      onContextMenu={(e) => e.preventDefault()}
      className={`inline-flex items-center justify-center min-h-10 px-4 rounded-lg text-sm font-semibold text-white transition-colors duration-700 ${holding ? 'bg-emerald-600' : 'bg-white/15'}`}
      aria-label="Board locked — press and hold, or activate, to unlock"
    >
      🔒 Locked — hold to unlock
    </button>
  )
}

function MatchOverlay({ children }: { children: React.ReactNode }) {
  return (
    // Scrolls when it doesn't fit (a short landscape phone once the Done link
    // or an error line appears clipped the Undo row off both ends).
    <div role="dialog" aria-modal="true" aria-label="Match over" className="fd-result-in fixed inset-0 z-40 bg-black/75 backdrop-blur-sm overflow-y-auto overscroll-contain px-6">
      <div className="min-h-full flex flex-col items-center justify-center text-center py-6">
        {children}
      </div>
    </div>
  )
}

// Scoreboard sheets on the shared Overlay: slide up / drag down to dismiss
// (bottom), or a top-anchored card on phones so the keyboard never covers
// the team-name field (top). Dark surface to match the board.
function Sheet({ open, title, onClose, children, align = 'bottom' }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; align?: 'bottom' | 'top' }) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant={align === 'top' ? 'modal' : 'sheet'}
      label={title}
      className={align === 'top' ? 'items-start pt-4 sm:items-center sm:pt-4' : ''}
      panelClassName={`w-full sm:max-w-sm bg-[#141c18] text-white p-5 pb-8 max-h-[85vh] overflow-y-auto ${align === 'top' ? 'mx-3 rounded-2xl' : 'rounded-t-2xl'} sm:rounded-2xl`}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-white font-bold">{title}</p>
        <button onClick={onClose} className="press text-white/50 hover:text-white text-2xl leading-none min-h-10 min-w-10 -mr-2" aria-label="Close">
          ×
        </button>
      </div>
      {children}
    </Overlay>
  )
}

// ── Clock row ─────────────────────────────────────────────────────────────────
// `[● T/O]  12:34  [T/O ●]` above the middle bar while the clock is on. Tap the
// clock to start/pause, hold it for settings. During a timeout it shows the
// timeout countdown + Resume; at 0:00 it offers Time · End set / End match.

const clockBtn = 'inline-flex items-center justify-center gap-1.5 min-h-10 min-w-10 px-3 rounded-lg text-xs font-semibold text-white'

function ClockRow({
  clock, now, teamA, teamB, order, locked, over, timeUp, setsMode, canEndSet, nextSet,
  onToggle, onTimeout, onResume, onOpenSettings, onEndSet, onEndMatch, onDismissTimeUp,
}: {
  clock: GameClock
  now: number
  teamA: TeamMeta
  teamB: TeamMeta
  order: ['A' | 'B', 'A' | 'B']
  locked: boolean
  over: boolean
  timeUp: boolean
  setsMode: boolean
  canEndSet: boolean
  nextSet: number
  onToggle: () => void
  onTimeout: (side: 'A' | 'B') => void
  onResume: () => void
  onOpenSettings: () => void
  onEndSet: () => void
  onEndMatch: () => void
  onDismissTimeUp: () => void
}) {
  const team = (side: 'A' | 'B') => (side === 'A' ? teamA : teamB)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const flashOff = !reduceMotion && Math.floor(now / 500) % 2 === 0

  const timeoutLeft = timeoutRemaining(clock, now)
  const expired = isExpired(clock, now)
  const running = isRunning(clock, now)
  const face = formatClock(displayMs(clock, now), clock.mode === 'countdown')

  const cancelHold = () => { if (hold.current.timer) clearTimeout(hold.current.timer); hold.current.timer = null }

  return (
    <div
      className={`flex items-center justify-between landscape:flex-col landscape:justify-center gap-2 px-2 pt-1.5 landscape:px-1.5 landscape:pt-2 ${locked ? 'pointer-events-none' : ''}`}
      style={{ touchAction: 'manipulation' }}
    >
      {timeUp ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5 w-full" role="status">
          <span className="text-xs font-extrabold uppercase tracking-wide text-red-400">Time</span>
          {setsMode && canEndSet && (
            <button onClick={onEndSet} className={`${clockBtn} bg-emerald-600 hover:bg-emerald-700`}>End set {nextSet}</button>
          )}
          <button onClick={onEndMatch} className={`${clockBtn} ${setsMode ? 'bg-white/10 hover:bg-white/15' : 'bg-emerald-600 hover:bg-emerald-700'}`}>🏁 End match</button>
          <button onClick={onDismissTimeUp} aria-label="Keep playing" className={`${clockBtn} bg-white/10 hover:bg-white/15`}>✕</button>
        </div>
      ) : clock.timeout && timeoutLeft != null ? (
        <div className="flex items-center justify-center gap-2 w-full">
          <span className="flex items-center gap-1.5 min-w-0 text-xs font-bold text-white/90">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: team(clock.timeout.side).color }} aria-hidden="true" />
            <span className="truncate">{team(clock.timeout.side).name} · T/O</span>
          </span>
          <span
            className={`text-2xl font-bold tabular-nums ${timeoutLeft <= 0 ? 'text-red-400' : 'text-white'}`}
            style={{ opacity: timeoutLeft <= 0 && flashOff ? 0.35 : 1 }}
            aria-label={`Timeout, ${formatClock(timeoutLeft, true)} left`}
          >
            {formatClock(timeoutLeft, true)}
          </span>
          <button onClick={onResume} className={`${clockBtn} ${timeoutLeft <= 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-white/10 hover:bg-white/15'}`}>▶ Resume</button>
        </div>
      ) : (
        <>
          {[order[0], order[1]].map((side, i) => {
            const button = (
              <button
                key={side}
                onClick={() => onTimeout(side)}
                disabled={over}
                aria-label={`Timeout, ${team(side).name}`}
                className={`${clockBtn} bg-white/10 hover:bg-white/15 disabled:opacity-40`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: team(side).color }} aria-hidden="true" />
                T/O
              </button>
            )
            if (i === 0) return button
            return [
              <button
                key="clock"
                onPointerDown={() => {
                  hold.current.fired = false
                  cancelHold()
                  hold.current.timer = setTimeout(() => {
                    hold.current.fired = true
                    try { navigator.vibrate?.(15) } catch {}
                    onOpenSettings()
                  }, 500)
                }}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (!hold.current.fired) onToggle() }}
                aria-label={`${clock.mode === 'countdown' ? 'Countdown' : 'Stopwatch'}, ${face}, ${expired ? "time's up" : running ? 'running' : 'paused'}. Tap to start or pause, hold for settings.`}
                className={`select-none px-3 min-h-11 text-3xl landscape:text-2xl font-bold tabular-nums ${expired ? 'text-red-400' : running ? 'text-white' : 'text-white/55'}`}
                style={{ opacity: expired && flashOff ? 0.35 : 1 }}
              >
                {face}
              </button>,
              button,
            ]
          })}
        </>
      )}
    </div>
  )
}

/** Clock settings: in the menu and behind a hold on the clock. */
function ClockSettings({ clock, onChange }: { clock: GameClock; onChange: (fn: (c: GameClock, now: number) => GameClock) => void }) {
  const minutes = Math.round(clock.lengthMs / 60_000)
  const pill = (active: boolean) => `py-2.5 rounded-lg text-sm font-semibold ${active ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}`
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['off', 'stopwatch', 'countdown'] as ClockMode[]).map((m) => (
          <button key={m} onClick={() => onChange((c) => setMode(c, m))} aria-pressed={clock.mode === m} className={`flex-1 ${pill(clock.mode === m)}`}>
            {m === 'off' ? 'Off' : m === 'stopwatch' ? 'Stopwatch' : 'Countdown'}
          </button>
        ))}
      </div>
      {clock.mode === 'countdown' && (
        <div>
          <p className="text-xs text-white/60 mb-1.5">Length (minutes)</p>
          <div className="flex flex-wrap items-center gap-2">
            {CLOCK_LENGTH_PRESETS.map((m) => (
              <button key={m} onClick={() => onChange((c) => setLength(c, m))} aria-pressed={minutes === m} className={`w-12 ${pill(minutes === m)}`}>{m}</button>
            ))}
            <span className="flex items-center gap-1 ml-auto">
              <button onClick={() => onChange((c) => setLength(c, minutes - 1))} aria-label="One minute shorter" className="w-10 h-10 rounded-lg bg-white/10 text-white text-lg">−</button>
              <span className="w-10 text-center text-sm font-semibold text-white tabular-nums">{minutes}</span>
              <button onClick={() => onChange((c) => setLength(c, minutes + 1))} aria-label="One minute longer" className="w-10 h-10 rounded-lg bg-white/10 text-white text-lg">+</button>
            </span>
          </div>
        </div>
      )}
      {isClockOn(clock) && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60 mr-auto">Timeout length</span>
            {[30_000, 60_000].map((ms) => (
              <button key={ms} onClick={() => onChange((c) => ({ ...c, timeoutLengthMs: ms }))} aria-pressed={clock.timeoutLengthMs === ms} className={`w-16 ${pill(clock.timeoutLengthMs === ms)}`}>
                {ms / 1000} s
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-white/80">
            <span id="sb-horn-label">Horn at zero</span>
            <button
              type="button"
              role="switch"
              aria-checked={clock.sound}
              aria-labelledby="sb-horn-label"
              onClick={() => onChange((c) => ({ ...c, sound: !c.sound }))}
              className={`relative w-12 h-7 rounded-full transition-colors ${clock.sound ? 'bg-emerald-500' : 'bg-white/20'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${clock.sound ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <button
            onClick={() => onChange((c) => resetClock(c))}
            disabled={clock.runningSince == null && clock.accumulatedMs === 0}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80 disabled:opacity-40"
          >
            Reset clock
          </button>
          <p className="text-[11px] text-white/45 leading-relaxed">
            Tap the clock to start or pause, hold it for these settings. At 0:00 it buzzes and offers End set / End match.
            Keep this screen open: a web page can&rsquo;t sound the buzzer from a locked phone.
          </p>
        </>
      )}
    </div>
  )
}
