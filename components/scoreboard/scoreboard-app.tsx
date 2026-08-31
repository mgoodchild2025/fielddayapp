'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { submitScore, adminSetScore } from '@/actions/scores'

// ── Fieldday Scoreboard ────────────────────────────────────────────────────────
// A standalone, offline-capable scoreboard: tap a panel to +1, swipe down to −1.
// Event-sourced: every score change is an event; scores and completed sets are
// derived by folding the event list, so undo is a pop and the per-set history
// falls out for free (matching game_results.sets' {home, away}[] shape).

type ScoreEvent = { t: 'A' | 'B'; d: 1 | -1 } | { t: 'set' }

type TeamMeta = { name: string; color: string }

type Config = {
  mode: 'free' | 'sets'
  target: number      // points to win a set
  bestOf: 3 | 5
  winBy2: boolean
}

type SavedGame = {
  v: 1
  events: ScoreEvent[]
  teamA: TeamMeta
  teamB: TeamMeta
  config: Config
  swapped: boolean
  updatedAt: number
}

// Attached mode: the board is scoring a real Fieldday game. Team A is always
// the home team so the saved result's home/away orientation is never wrong.
export type AttachedGame = {
  gameId: string
  leagueId: string
  leagueName: string
  setSport: boolean
  home: { name: string; color: string | null }
  away: { name: string; color: string | null }
  canSave: 'admin' | 'captain' | null
  resultStatus: string | null
}

const STORAGE_KEY = 'fieldday-scoreboard-v1'

const COLORS = ['#0E9F6E', '#2563EB', '#DC2626', '#EA580C', '#7C3AED', '#DB2777', '#0891B2', '#475569']

const DEFAULTS: SavedGame = {
  v: 1,
  events: [],
  teamA: { name: 'HOME', color: COLORS[0] },
  teamB: { name: 'AWAY', color: COLORS[1] },
  config: { mode: 'free', target: 25, bestOf: 3, winBy2: true },
  swapped: false,
  updatedAt: 0,
}

function attachedDefaults(att: AttachedGame): SavedGame {
  return {
    ...DEFAULTS,
    teamA: { name: att.home.name, color: att.home.color ?? COLORS[0] },
    teamB: { name: att.away.name, color: att.away.color ?? COLORS[1] },
    config: { ...DEFAULTS.config, mode: att.setSport ? 'sets' : 'free' },
  }
}

function load(key: string, att: AttachedGame | null): SavedGame {
  const base = att ? attachedDefaults(att) : DEFAULTS
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return base
    const parsed = JSON.parse(raw) as SavedGame
    if (parsed?.v !== 1 || !Array.isArray(parsed.events)) return base
    return { ...base, ...parsed }
  } catch {
    return base
  }
}

function derive(events: ScoreEvent[]) {
  const sets: { home: number; away: number }[] = []
  let a = 0
  let b = 0
  for (const e of events) {
    if (e.t === 'set') {
      sets.push({ home: a, away: b })
      a = 0
      b = 0
    } else if (e.t === 'A') {
      a = Math.max(0, a + e.d)
    } else {
      b = Math.max(0, b + e.d)
    }
  }
  return { a, b, sets }
}

function setWinner(cfg: Config, a: number, b: number): 'A' | 'B' | null {
  if (cfg.mode !== 'sets') return null
  const lead = cfg.winBy2 ? 2 : 1
  if (a >= cfg.target && a - b >= lead) return 'A'
  if (b >= cfg.target && b - a >= lead) return 'B'
  return null
}

export function ScoreboardApp({ attached = null }: { attached?: AttachedGame | null }) {
  const [game, setGame] = useState<SavedGame>(attached ? attachedDefaults(attached) : DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editTeam, setEditTeam] = useState<'A' | 'B' | null>(null)
  const [flash, setFlash] = useState<'A' | 'B' | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Each attached game gets its own storage slot; the standalone board keeps its own.
  const storageKey = attached ? `${STORAGE_KEY}:game:${attached.gameId}` : STORAGE_KEY

  // Load saved game once on mount (client only)
  useEffect(() => {
    setGame(load(storageKey, attached))
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // Persist on every change
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...game, updatedAt: Date.now() }))
    } catch {
      // storage full/unavailable — scoreboard still works, just won't survive reload
    }
  }, [game, loaded, storageKey])

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
      navigator.serviceWorker.register('/scoreboard-sw.js', { scope: '/scoreboard' }).catch(() => {})
    }
  }, [])

  const { a, b, sets } = useMemo(() => derive(game.events), [game.events])
  const setsWonA = sets.filter((s) => s.home > s.away).length
  const setsWonB = sets.filter((s) => s.away > s.home).length
  const need = Math.ceil(game.config.bestOf / 2)
  const pendingSetWinner = setWinner(game.config, a, b)
  const matchWinner = game.config.mode === 'sets' && setsWonA >= need ? 'A' : setsWonB >= need ? 'B' : null

  const push = useCallback((e: ScoreEvent) => {
    setGame((g) => ({ ...g, events: [...g.events, e] }))
  }, [])

  const undo = useCallback(() => {
    setGame((g) => ({ ...g, events: g.events.slice(0, -1) }))
  }, [])

  const score = useCallback(
    (team: 'A' | 'B', d: 1 | -1) => {
      if (matchWinner) return
      push({ t: team, d })
      if (d === 1) {
        setFlash(team)
        setTimeout(() => setFlash(null), 180)
        try {
          navigator.vibrate?.(30)
        } catch {
          // iOS Safari has no vibration API
        }
      }
    },
    [matchWinner, push]
  )

  // ── Panel gestures: tap = +1, swipe down = −1, long-press = edit team ──────
  const gesture = useRef<{ id: number; y: number; x: number; ts: number; team: 'A' | 'B'; longPress: ReturnType<typeof setTimeout>; consumed: boolean } | null>(null)

  const onPointerDown = (team: 'A' | 'B') => (e: React.PointerEvent) => {
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
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    // Real movement cancels the long-press
    if (Math.abs(e.clientY - g.y) > 12 || Math.abs(e.clientX - g.x) > 12) clearTimeout(g.longPress)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    clearTimeout(g.longPress)
    gesture.current = null
    if (g.consumed) return
    const dy = e.clientY - g.y
    const dx = Math.abs(e.clientX - g.x)
    if (dy > 40 && dy > dx) {
      score(g.team, -1) // swipe down
    } else if (Math.abs(dy) < 14 && dx < 14 && Date.now() - g.ts < 500) {
      score(g.team, 1) // tap
    }
  }

  const onPointerCancel = () => {
    if (gesture.current) clearTimeout(gesture.current.longPress)
    gesture.current = null
  }

  const reset = () => {
    setGame((g) => ({ ...g, events: [] }))
    setSaveState('idle')
    setMenuOpen(false)
  }

  // Attached mode: push the result through the normal score pipeline — admins
  // save confirmed (adminSetScore), captains submit pending (submitScore, the
  // opposing captain confirms). Set sports save sets-won as the match score
  // plus the per-set line, matching AdminScoreEntry's convention.
  const saveResult = async () => {
    if (!attached?.canSave) return
    setSaveState('saving')
    const isSets = game.config.mode === 'sets'
    const homeScore = isSets ? setsWonA : a
    const awayScore = isSets ? setsWonB : b
    const setLine = isSets && sets.length > 0 ? sets : undefined
    try {
      const res =
        attached.canSave === 'admin'
          ? await adminSetScore({ gameId: attached.gameId, leagueId: attached.leagueId, homeScore, awayScore, sets: setLine })
          : await submitScore({ gameId: attached.gameId, homeScore, awayScore, sets: setLine })
      if (res?.error) throw new Error(res.error)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const saveButton = (className: string) =>
    attached?.canSave ? (
      <div className="flex flex-col items-center gap-1.5">
        <button onClick={saveResult} disabled={saveState === 'saving' || saveState === 'saved'} className={className}>
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
            ? attached.canSave === 'admin'
              ? '✓ Saved as final'
              : '✓ Submitted — opponent confirms'
            : attached.canSave === 'admin'
            ? 'Save final score'
            : 'Submit score'}
        </button>
        {saveState === 'error' && (
          <p className="text-xs text-red-300 max-w-[240px] text-center">
            Couldn’t reach Fieldday — the score is safe on this device. Try again when you’re back online.
          </p>
        )}
      </div>
    ) : null

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
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
        role="button"
        aria-label={`${meta.name}: ${pts} points. Tap to add a point, swipe down to remove one.`}
        className="relative flex-1 flex flex-col items-center justify-center select-none overflow-hidden"
        style={{ background: `linear-gradient(180deg, ${meta.color}, color-mix(in srgb, ${meta.color} 72%, black))`, touchAction: 'none' }}
        onPointerDown={onPointerDown(team)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <p className="text-white/85 font-bold uppercase tracking-[0.14em] text-sm sm:text-base px-4 text-center truncate max-w-full">
          {meta.name}
        </p>
        <p
          className="text-white font-bold leading-none tabular-nums transition-transform duration-150"
          style={{
            fontSize: 'min(34vh, 38vw)',
            transform: flash === team ? 'scale(1.06)' : 'scale(1)',
            textShadow: '0 4px 24px rgba(0,0,0,0.35)',
          }}
        >
          {pts}
        </p>
        {game.config.mode === 'sets' && (
          <div className="flex gap-1.5 mt-1" aria-label={`${won} sets won`}>
            {Array.from({ length: game.config.bestOf }, (_, i) => (
              <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < won ? 'bg-white' : 'bg-white/25'}`} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0B1210] flex flex-col portrait:flex-col landscape:flex-row overscroll-none">
      {panel(first)}

      {/* Middle bar */}
      <div className="flex landscape:flex-col items-center justify-center gap-2 px-2 py-1.5 landscape:px-1.5 landscape:py-2 bg-[#0B1210] text-[#9db3a9] shrink-0">
        {game.config.mode === 'sets' && (
          <span className="text-[11px] font-mono tracking-wider px-2 py-1 rounded bg-white/5 whitespace-nowrap">
            SET {sets.length + 1}
          </span>
        )}
        <button
          onClick={undo}
          disabled={game.events.length === 0}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-30 text-white transition-colors"
          aria-label="Undo last score change"
        >
          ↩ Undo
        </button>
        <button
          onClick={() => setGame((g) => ({ ...g, swapped: !g.swapped }))}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          aria-label="Swap sides"
        >
          ⇄ Swap
        </button>
        <button
          onClick={() => setMenuOpen(true)}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          aria-label="Menu"
        >
          ⋯
        </button>
      </div>

      {panel(second)}

      {/* Set-won overlay */}
      {pendingSetWinner && !matchWinner && (
        <Overlay>
          <p className="text-white text-2xl font-bold mb-1">
            {(pendingSetWinner === 'A' ? game.teamA : game.teamB).name} take set {sets.length + 1}
          </p>
          <p className="text-white/60 text-lg tabular-nums mb-6">
            {a}–{b}
          </p>
          <div className="flex gap-3">
            <button onClick={() => push({ t: 'set' })} className="px-6 py-3 rounded-xl bg-emerald-500 text-white font-bold">
              Confirm set →
            </button>
            <button onClick={undo} className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">
              ↩ Undo
            </button>
          </div>
        </Overlay>
      )}

      {/* Match-won overlay */}
      {matchWinner && (
        <Overlay>
          <p className="text-4xl mb-2">🏆</p>
          <p className="text-white text-2xl font-bold mb-1">
            {(matchWinner === 'A' ? game.teamA : game.teamB).name} win the match
          </p>
          <p className="text-white/60 text-lg tabular-nums mb-6">
            {sets.map((s) => `${s.home}–${s.away}`).join('  ')}
          </p>
          <div className="flex flex-col items-center gap-3">
            {saveButton('px-6 py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-60')}
            <div className="flex gap-3">
              <button onClick={reset} className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">
                New game
              </button>
              <button onClick={undo} className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">
                ↩ Undo
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Team edit sheet */}
      {editTeam && (
        <Sheet onClose={() => setEditTeam(null)} title={`Edit ${editTeam === 'A' ? 'first' : 'second'} team`}>
          <label className="block text-xs text-white/60 mb-1">Team name</label>
          <input
            autoFocus
            value={(editTeam === 'A' ? game.teamA : game.teamB).name}
            onChange={(e) =>
              setGame((g) => ({
                ...g,
                [editTeam === 'A' ? 'teamA' : 'teamB']: { ...(editTeam === 'A' ? g.teamA : g.teamB), name: e.target.value.slice(0, 24) },
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
                    [editTeam === 'A' ? 'teamA' : 'teamB']: { ...(editTeam === 'A' ? g.teamA : g.teamB), color: c },
                  }))
                }
                aria-label={`Colour ${c}`}
                className="w-9 h-9 rounded-full border-2"
                style={{ background: c, borderColor: (editTeam === 'A' ? game.teamA : game.teamB).color === c ? 'white' : 'transparent' }}
              />
            ))}
          </div>
        </Sheet>
      )}

      {/* Menu sheet */}
      {menuOpen && (
        <Sheet onClose={() => setMenuOpen(false)} title="Scoreboard">
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
            <div>
              <label className="block text-xs text-white/60 mb-1.5">Scoring mode</label>
              <div className="flex gap-2">
                {(['free', 'sets'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setGame((g) => ({ ...g, config: { ...g.config, mode: m } }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${game.config.mode === m ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}`}
                  >
                    {m === 'free' ? 'Free score' : 'Sets'}
                  </button>
                ))}
              </div>
            </div>

            {game.config.mode === 'sets' && (
              <>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Points per set</label>
                  <div className="flex gap-2">
                    {[15, 21, 25].map((t) => (
                      <button
                        key={t}
                        onClick={() => setGame((g) => ({ ...g, config: { ...g.config, target: t } }))}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold tabular-nums ${game.config.target === t ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Match length</label>
                  <div className="flex gap-2">
                    {([3, 5] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setGame((g) => ({ ...g, config: { ...g.config, bestOf: n } }))}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold ${game.config.bestOf === n ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}`}
                      >
                        Best of {n}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setGame((g) => ({ ...g, config: { ...g.config, winBy2: !g.config.winBy2 } }))}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80"
                >
                  Win by 2: {game.config.winBy2 ? 'on' : 'off'}
                </button>
              </>
            )}

            <div className="flex gap-2">
              <button onClick={() => setEditTeam('A')} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80">
                Edit {game.teamA.name}
              </button>
              <button onClick={() => setEditTeam('B')} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white/80">
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
                onClick={() => {
                  if (game.events.length === 0 || confirm('Reset all scores?')) reset()
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-500/20 text-red-300"
              >
                Reset game
              </button>
            </div>

            <p className="text-center text-xs text-white/40 pt-2">
              Tap a side to score · swipe down to take one back · hold to edit
              <br />
              <a href="https://fielddayapp.ca" className="underline underline-offset-2 text-white/50">
                Powered by Fieldday
              </a>{' '}
              — free league management for community sports
            </p>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
      {children}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-[#141c18] rounded-t-2xl sm:rounded-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">{title}</p>
          <button onClick={onClose} className="text-white/50 hover:text-white text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
