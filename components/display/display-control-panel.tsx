'use client'

import { useState, useTransition } from 'react'
import { saveDisplayConfig, deleteDisplayScreen } from '@/actions/display'
import type { DisplayConfig, LayoutId, ZoneConfig } from '@/lib/display-types'
import { ZONE_COUNT, ZONE_LABELS, defaultConfig, blankZone } from '@/lib/display-types'

// ── Layout definitions ────────────────────────────────────────────────────────

const LAYOUTS: { id: LayoutId; label: string; preview: React.ReactNode }[] = [
  { id: 'fullscreen',     label: 'Full',         preview: <LayoutPrev cells={[[1,1,2,2]]} /> },
  { id: 'split_h',        label: 'Side by Side',  preview: <LayoutPrev cells={[[1,1,1,2],[2,1,2,2]]} /> },
  { id: 'split_v',        label: 'Top / Bottom',  preview: <LayoutPrev cells={[[1,1,2,1],[1,2,2,2]]} /> },
  { id: 'main_sidebar',   label: 'Main + Sidebar',preview: <LayoutPrev cells={[[1,1,1.5,2],[1.5,1,2,2]]} narrow={[1]} /> },
  { id: 'sidebar_main',   label: 'Sidebar + Main',preview: <LayoutPrev cells={[[1,1,1.5,2],[1.5,1,2,2]]} narrow={[0]} /> },
  { id: 'thirds',         label: 'Three Columns', preview: <LayoutPrev cells={[[1,1,1.67,2],[1.67,1,2.33,2],[2.33,1,3,2]]} /> },
  { id: 'main_two_right', label: 'Main + 2 Right', preview: <LayoutPrev cells={[[1,1,1.5,2],[1.5,1,2,1.5],[1.5,1.5,2,2]]} narrow={[1,2]} /> },
  { id: 'two_left_main',  label: '2 Left + Main',  preview: <LayoutPrev cells={[[1,1,1.5,1.5],[1,1.5,1.5,2],[1.5,1,2,2]]} narrow={[0,1]} /> },
  { id: 'main_top_two',   label: 'Top + 2 Below',  preview: <LayoutPrev cells={[[1,1,2,1.5],[1,1.5,1.5,2],[1.5,1.5,2,2]]} narrow={[1,2]} /> },
  { id: 'two_top_main',   label: '2 Above + Main', preview: <LayoutPrev cells={[[1,1,1.5,1.5],[1.5,1,2,1.5],[1,1.5,2,2]]} narrow={[0,1]} /> },
  { id: 'three_rows',     label: 'Three Rows',     preview: <LayoutPrev cells={[[1,1,2,1.33],[1,1.33,2,1.67],[1,1.67,2,2]]} /> },
  { id: 'four_quad',      label: '4 Panels',       preview: <LayoutPrev cells={[[1,1,1.5,1.5],[1.5,1,2,1.5],[1,1.5,1.5,2],[1.5,1.5,2,2]]} /> },
]

function LayoutPrev({ cells, narrow }: { cells: [number,number,number,number][]; narrow?: number[] }) {
  return (
    <div className="relative w-16 h-10 bg-zinc-800 rounded border border-zinc-600 overflow-hidden">
      {cells.map(([c1,r1,c2,r2], i) => (
        <div
          key={i}
          className={`absolute border border-zinc-500 ${narrow?.includes(i) ? 'bg-zinc-700' : 'bg-zinc-600'}`}
          style={{
            left:   `${((c1-1)/2)*100}%`,
            top:    `${((r1-1)/2)*100}%`,
            width:  `${((c2-c1)/2)*100}%`,
            height: `${((r2-r1)/2)*100}%`,
          }}
        />
      ))}
    </div>
  )
}

// ── Zone type options ─────────────────────────────────────────────────────────

const ZONE_TYPES: { value: ZoneConfig['type']; label: string; icon: string }[] = [
  { value: 'schedule',  label: 'Schedule',   icon: '📅' },
  { value: 'standings', label: 'Standings',  icon: '🏆' },
  { value: 'bracket',   label: 'Bracket',    icon: '🎯' },
  { value: 'qr_code',   label: 'QR Code',    icon: '⬛' },
  { value: 'message',   label: 'Message',    icon: '💬' },
  { value: 'clock',     label: 'Clock',      icon: '🕐' },
  { value: 'logo',      label: 'Logo',       icon: '🎨' },
  { value: 'empty',     label: 'Empty',      icon: '⬜' },
]

// ── Zone editor ───────────────────────────────────────────────────────────────

function ZoneEditor({
  label, zone, onChange, pools, bracketTiers,
}: {
  label: string
  zone: ZoneConfig
  onChange: (z: ZoneConfig) => void
  pools: { id: string; name: string }[]
  bracketTiers: { name: string }[]
}) {
  const sel = (type: ZoneConfig['type']) => {
    switch (type) {
      case 'schedule':  return { type, date_filter: 'today' as const, pool_id: null, court_filter: null }
      case 'standings': return { type, pool_id: null }
      case 'bracket':   return { type, round_filter: 'all' as const, tier_filter: null }
      case 'qr_code':   return { type, url: '', label: 'Scan to Register' }
      case 'message':   return { type, title: '', body: 'Welcome!', font_size: 'lg' as const }
      case 'clock':     return { type }
      case 'logo':      return { type }
      case 'empty':     return { type }
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Zone {label}</span>
      </div>

      {/* Type picker */}
      <div className="grid grid-cols-4 gap-1.5">
        {ZONE_TYPES.map((zt) => (
          <button
            key={zt.value}
            type="button"
            onClick={() => onChange(sel(zt.value))}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs font-medium transition-colors ${
              zone.type === zt.value
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span>{zt.icon}</span>
            <span className="leading-none">{zt.label}</span>
          </button>
        ))}
      </div>

      {/* Type-specific options */}
      {zone.type === 'schedule' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-200 mb-1">Date filter</label>
            <select
              value={zone.date_filter}
              onChange={(e) => onChange({ ...zone, date_filter: e.target.value as 'today' | 'all' })}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
            >
              <option value="today">Today's games only</option>
              <option value="all">All games</option>
            </select>
          </div>
          {pools.length > 0 && (
            <div>
              <label className="block text-xs text-gray-200 mb-1">Pool filter</label>
              <select
                value={zone.pool_id ?? ''}
                onChange={(e) => onChange({ ...zone, pool_id: e.target.value || null })}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
              >
                <option value="">All pools</option>
                {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-200 mb-1">Scroll speed</label>
            <select
              value={zone.scroll_speed ?? ''}
              onChange={(e) => onChange({ ...zone, scroll_speed: (e.target.value || null) as 'slow' | 'normal' | 'fast' | null })}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
            >
              <option value="">Auto</option>
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </div>
        </div>
      )}

      {zone.type === 'standings' && pools.length > 0 && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Pool filter</label>
          <select
            value={zone.pool_id ?? ''}
            onChange={(e) => onChange({ ...zone, pool_id: e.target.value || null })}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
          >
            <option value="">All teams</option>
            {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {zone.type === 'bracket' && (
        <div className="space-y-2">
          {bracketTiers.length > 1 && (
            <div>
              <label className="block text-xs text-gray-200 mb-1">Tier to show</label>
              <select
                value={zone.tier_filter ?? ''}
                onChange={(e) => onChange({ ...zone, tier_filter: e.target.value || null })}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
              >
                <option value="">All tiers</option>
                {bracketTiers.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-200 mb-1">Rounds to show</label>
            <select
              value={zone.round_filter}
              onChange={(e) => onChange({ ...zone, round_filter: e.target.value as typeof zone.round_filter })}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
            >
              <optgroup label="Single round">
                <option value="first">First round only</option>
                <option value="quarters">Quarter-Finals only</option>
                <option value="semis">Semi-Finals only</option>
                <option value="final">Final only</option>
              </optgroup>
              <optgroup label="Multiple rounds">
                <option value="last_2">Semi-Finals + Final</option>
                <option value="last_3">Quarter-Finals + Semis + Final</option>
                <option value="all">All rounds</option>
              </optgroup>
            </select>
          </div>
        </div>
      )}

      {zone.type === 'qr_code' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-200 mb-1">URL</label>
            <input
              type="url"
              value={zone.url}
              onChange={(e) => onChange({ ...zone, url: e.target.value })}
              placeholder="https://..."
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-200 mb-1">Label (shown below QR)</label>
            <input
              type="text"
              value={zone.label}
              onChange={(e) => onChange({ ...zone, label: e.target.value })}
              placeholder="Scan to sign waiver"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-gray-500"
            />
          </div>
        </div>
      )}

      {zone.type === 'message' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-200 mb-1">Sub-heading (optional)</label>
            <input
              type="text"
              value={zone.title ?? ''}
              onChange={(e) => onChange({ ...zone, title: e.target.value })}
              placeholder="ANNOUNCEMENT"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-200 mb-1">Message</label>
            <textarea
              value={zone.body}
              onChange={(e) => onChange({ ...zone, body: e.target.value })}
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-200 mb-1">Text size</label>
            <select
              value={zone.font_size ?? 'lg'}
              onChange={(e) => onChange({ ...zone, font_size: e.target.value as 'sm'|'md'|'lg'|'xl' })}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white"
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">Huge</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single-screen editor ──────────────────────────────────────────────────────

interface ScreenState {
  screen:  number
  enabled: boolean
  config:  DisplayConfig
}

function ScreenEditor({
  state, onChange, onSave, onToggleEnabled, onDelete, isSaving, isDirty, displayBaseUrl, pools, bracketTiers, leagueId,
}: {
  state: ScreenState
  onChange: (s: ScreenState) => void
  onSave: () => void
  onToggleEnabled: (newEnabled: boolean) => void
  onDelete: () => void
  isSaving: boolean
  isDirty: boolean
  displayBaseUrl: string
  pools: { id: string; name: string }[]
  bracketTiers: { name: string }[]
  leagueId: string
}) {
  const { screen, enabled, config } = state
  const tvUrl = `${displayBaseUrl}/${screen}`

  function setConfig(partial: Partial<DisplayConfig>) {
    onChange({ ...state, config: { ...config, ...partial } })
  }

  function setZone(index: number, zone: ZoneConfig) {
    const zones = [...config.zones]
    zones[index] = zone
    setConfig({ zones })
  }

  function setLayout(layout: LayoutId) {
    const count = ZONE_COUNT[layout]
    const zones: ZoneConfig[] = Array.from({ length: count }, (_, i) =>
      config.zones[i] ?? blankZone()
    )
    setConfig({ layout, zones })
  }

  const zoneLabels = ZONE_LABELS[config.layout]

  return (
    <div className="space-y-6">
      {/* TV URL + enable toggle */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-200 uppercase tracking-wider mb-1">TV Display URL</p>
            <div className="flex items-center gap-2">
              <code className="text-sm text-orange-400 bg-gray-900 px-2 py-1 rounded truncate block flex-1 min-w-0">
                {tvUrl}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(tvUrl)}
                className="shrink-0 text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Copy
              </button>
              <a
                href={tvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Open ↗
              </a>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Open this URL on your TV browser, then press F11 for fullscreen.
            </p>
          </div>
          <div className="shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={isSaving}
                onClick={() => onToggleEnabled(!enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm font-medium text-gray-200">
                {enabled ? 'Display ON' : 'Display OFF'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Layout picker */}
      <div>
        <p className="text-sm font-semibold text-gray-200 mb-3">Layout</p>
        <div className="grid grid-cols-4 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLayout(l.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors ${
                config.layout === l.id
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              {l.preview}
              <span className="text-[11px] font-medium text-gray-300 leading-tight text-center">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zone editors */}
      <div>
        <p className="text-sm font-semibold text-gray-200 mb-3">Content Zones</p>
        <div className="space-y-3">
          {config.zones.map((zone, i) => (
            <ZoneEditor
              key={i}
              label={zoneLabels[i]}
              zone={zone}
              onChange={(z) => setZone(i, z)}
              pools={pools}
              bracketTiers={bracketTiers}
            />
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-200">Options</p>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
            <input
              type="checkbox"
              checked={config.show_header}
              onChange={(e) => setConfig({ show_header: e.target.checked })}
              className="rounded accent-orange-500"
            />
            Show event name + clock at top
          </label>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-200 w-32 shrink-0">Theme</label>
          <div className="flex gap-2">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setConfig({ theme: t })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  config.theme === t
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-200 w-32 shrink-0">Refresh every</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={300}
              value={config.refresh_seconds}
              onChange={(e) => setConfig({ refresh_seconds: Math.max(10, parseInt(e.target.value) || 30) })}
              className="w-20 bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-sm text-white text-right"
            />
            <span className="text-sm text-gray-200">seconds</span>
          </div>
        </div>
      </div>

      {/* Save / Delete */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onDelete}
          disabled={isSaving}
          className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
        >
          Remove Screen {screen}
        </button>
        <div className="flex items-center gap-3">
          {isDirty && !isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={`px-5 py-2 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors ${
              isDirty && !isSaving
                ? 'bg-orange-500 hover:bg-orange-400 ring-2 ring-orange-400/50'
                : 'bg-orange-500 hover:bg-orange-400'
            }`}
          >
            {isSaving ? 'Saving…' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main control panel ────────────────────────────────────────────────────────

interface Props {
  leagueId:       string
  leagueName:     string
  displayBaseUrl: string
  pools:          { id: string; name: string }[]
  bracketTiers:   { name: string }[]
  timezone:       string
  initialScreens: ScreenState[]
}

export function DisplayControlPanel({
  leagueId, leagueName, displayBaseUrl, pools, bracketTiers, timezone, initialScreens,
}: Props) {
  const [screens, setScreens] = useState<ScreenState[]>(
    initialScreens.length > 0 ? initialScreens : [{ screen: 1, enabled: false, config: defaultConfig() }]
  )
  const [activeScreen, setActiveScreen] = useState(screens[0].screen)
  const [isPending, startTransition] = useTransition()
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)
  const [dirty, setDirty]   = useState(false)

  const currentScreen = screens.find((s) => s.screen === activeScreen)!

  function updateScreen(updated: ScreenState) {
    setSaved(false)
    setDirty(true)
    setScreens((prev) => prev.map((s) => s.screen === updated.screen ? updated : s))
  }

  function addScreen() {
    const used = new Set(screens.map((s) => s.screen))
    const next = [1, 2, 3, 4].find((n) => !used.has(n))
    if (!next) return
    const newScreen: ScreenState = { screen: next, enabled: false, config: defaultConfig() }
    setScreens((prev) => [...prev, newScreen].sort((a, b) => a.screen - b.screen))
    setActiveScreen(next)
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const toSave = screens.find((s) => s.screen === activeScreen)!
    startTransition(async () => {
      const result = await saveDisplayConfig(leagueId, toSave.screen, toSave.config, toSave.enabled)
      if (result.error) { setError(result.error) }
      else { setSaved(true); setDirty(false) }
    })
  }

  // Toggling Display ON/OFF saves & applies immediately. The new enabled value
  // is passed explicitly to avoid saving against stale React state.
  function handleToggleEnabled(newEnabled: boolean) {
    setError(null)
    setSaved(false)
    const current = screens.find((s) => s.screen === activeScreen)!
    const updated = { ...current, enabled: newEnabled }
    setScreens((prev) => prev.map((s) => s.screen === updated.screen ? updated : s))
    startTransition(async () => {
      const result = await saveDisplayConfig(leagueId, updated.screen, updated.config, newEnabled)
      if (result.error) { setError(result.error) }
      else { setSaved(true); setDirty(false) }
    })
  }

  function handleDelete() {
    if (!confirm(`Remove Screen ${activeScreen}? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      await deleteDisplayScreen(leagueId, activeScreen)
      const remaining = screens.filter((s) => s.screen !== activeScreen)
      if (remaining.length === 0) {
        const fresh: ScreenState = { screen: 1, enabled: false, config: defaultConfig() }
        setScreens([fresh])
        setActiveScreen(1)
      } else {
        setScreens(remaining)
        setActiveScreen(remaining[0].screen)
      }
    })
  }

  return (
    <div className="max-w-2xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Display Mode</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure live TV displays for {leagueName}. Each screen has its own URL.
        </p>
      </div>

      {/* Screen tabs */}
      <div className="flex items-center gap-2 mb-6">
        {screens.map((s) => (
          <button
            key={s.screen}
            type="button"
            onClick={() => { setActiveScreen(s.screen); setSaved(false); setError(null); setDirty(false) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              s.screen === activeScreen
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span>📺 Screen {s.screen}</span>
            {s.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        ))}
        {screens.length < 4 && (
          <button
            type="button"
            onClick={addScreen}
            className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            + Add Screen
          </button>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {saved && !dirty && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400">
          ✓ Screen {activeScreen} saved — the TV display will update within {currentScreen.config.refresh_seconds}s.
        </div>
      )}

      {/* Screen editor */}
      <ScreenEditor
        state={currentScreen}
        onChange={updateScreen}
        onSave={handleSave}
        onToggleEnabled={handleToggleEnabled}
        onDelete={handleDelete}
        isSaving={isPending}
        isDirty={dirty}
        displayBaseUrl={displayBaseUrl}
        pools={pools}
        bracketTiers={bracketTiers}
        leagueId={leagueId}
      />
    </div>
  )
}
