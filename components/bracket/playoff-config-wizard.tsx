'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { savePlayoffConfig, generateAllTierBrackets, deletePlayoffConfig } from '@/actions/playoff-config'
import { publishBracket, deleteBracket } from '@/actions/brackets'
import { BracketView, type BracketData, type TeamRef } from './bracket-view'
import type { TeamStanding, BracketRecommendation } from '@/lib/bracket'
import type { TierInput } from '@/actions/playoff-config'

// ── Tier name suggestions ─────────────────────────────────────────────────────

const TIER_PRESETS: Record<number, string[]> = {
  1: ['Championship'],
  2: ['Gold', 'Silver'],
  3: ['Gold', 'Silver', 'Bronze'],
  4: ['Gold', 'Silver', 'Bronze', 'Copper'],
}

const TIER_ALT_NAMES = ['A Division', 'B Division', 'C Division', 'D Division', 'Championship', 'Consolation', 'Placement']

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierConfig {
  id?: string  // set if this tier already exists in DB
  name: string
  seedFrom: number
  seedTo: number
  bracketType: 'single_elimination' | 'double_elimination'
  thirdPlaceGame: boolean
}

export interface ExistingTier {
  id: string
  name: string
  sortOrder: number
  seedFrom: number
  seedTo: number
  bracketType: 'single_elimination' | 'double_elimination'
  thirdPlaceGame: boolean
  bracketId: string | null
  bracket: BracketData | null
}

export interface ExistingConfig {
  id: string
  seedingMethod: 'standings' | 'manual'
  tiers: ExistingTier[]
}

interface Props {
  leagueId: string
  sport?: string
  isOrgAdmin: boolean
  seededTeams: TeamStanding[]
  allTeams: TeamRef[]
  recommendation: BracketRecommendation
  existingConfig: ExistingConfig | null
}

// ── Tier seed split helper ────────────────────────────────────────────────────

function buildTiersFromCount(totalTeams: number, tierCount: number): TierConfig[] {
  if (tierCount < 1 || totalTeams < 2) return []
  const perTier = Math.ceil(totalTeams / tierCount)
  const names = TIER_PRESETS[tierCount] ?? Array.from({ length: tierCount }, (_, i) => `Division ${i + 1}`)
  const tiers: TierConfig[] = []
  for (let i = 0; i < tierCount; i++) {
    const seedFrom = i * perTier + 1
    const seedTo = Math.min((i + 1) * perTier, totalTeams)
    if (seedFrom > totalTeams) break
    tiers.push({
      name: names[i] ?? `Division ${i + 1}`,
      seedFrom,
      seedTo,
      bracketType: 'single_elimination',
      thirdPlaceGame: false,
    })
  }
  return tiers
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TierRow({
  tier,
  index,
  totalTeams,
  onChange,
  onRemove,
  canRemove,
}: {
  tier: TierConfig
  index: number
  totalTeams: number
  onChange: (updates: Partial<TierConfig>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const seedOptions: number[] = []
  for (let i = 1; i <= totalTeams; i++) seedOptions.push(i)

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center py-2 border-b last:border-0">
      {/* Name with suggestions */}
      <div className="relative">
        <input
          list={`tier-names-${index}`}
          value={tier.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Gold"
          className="w-full border rounded-md px-2.5 py-1.5 text-sm font-medium"
        />
        <datalist id={`tier-names-${index}`}>
          {[...Object.values(TIER_PRESETS).flat(), ...TIER_ALT_NAMES]
            .filter((n, i, a) => a.indexOf(n) === i)
            .map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>

      {/* Seed from */}
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <span className="text-xs text-gray-400">Seeds</span>
        <select
          value={tier.seedFrom}
          onChange={(e) => onChange({ seedFrom: Number(e.target.value) })}
          className="border rounded px-1.5 py-1.5 text-sm w-14"
        >
          {seedOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>–</span>
        <select
          value={tier.seedTo}
          onChange={(e) => onChange({ seedTo: Number(e.target.value) })}
          className="border rounded px-1.5 py-1.5 text-sm w-14"
        >
          {seedOptions.filter((n) => n >= tier.seedFrom).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Format */}
      <select
        value={tier.bracketType}
        onChange={(e) => onChange({ bracketType: e.target.value as 'single_elimination' | 'double_elimination' })}
        className="border rounded px-2 py-1.5 text-xs"
      >
        <option value="single_elimination">Single Elim</option>
        <option value="double_elimination">Double Elim</option>
      </select>

      {/* 3rd place */}
      {tier.bracketType === 'single_elimination' ? (
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={tier.thirdPlaceGame}
            onChange={(e) => onChange({ thirdPlaceGame: e.target.checked })}
            className="rounded"
          />
          3rd place
        </label>
      ) : (
        <span className="text-xs text-gray-300 whitespace-nowrap">3rd place</span>
      )}

      {/* Team count badge */}
      <span className="text-xs text-gray-400 whitespace-nowrap">
        {tier.seedTo - tier.seedFrom + 1} teams
      </span>

      {/* Remove */}
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-300 hover:text-red-400 text-lg leading-none w-6 text-center"
          title="Remove tier"
        >×</button>
      ) : <span className="w-6" />}
    </div>
  )
}

// ── Tier bracket management card ──────────────────────────────────────────────

function TierBracketCard({
  tier,
  leagueId,
  sport,
  allTeams,
  isOrgAdmin,
  onDeleted,
}: {
  tier: ExistingTier
  leagueId: string
  sport?: string
  allTeams: TeamRef[]
  isOrgAdmin: boolean
  onDeleted: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const tierCount = tier.seedTo - tier.seedFrom + 1
  const tierColors: Record<string, string> = {
    'Gold': 'text-yellow-600 bg-yellow-50 border-yellow-200',
    'Silver': 'text-gray-500 bg-gray-50 border-gray-200',
    'Bronze': 'text-orange-600 bg-orange-50 border-orange-200',
    'Championship': 'text-blue-600 bg-blue-50 border-blue-200',
  }
  const colorClass = tierColors[tier.name] ?? 'text-purple-600 bg-purple-50 border-purple-200'

  function handlePublish() {
    if (!tier.bracketId) return
    setErr(null)
    startTransition(async () => {
      const r = await publishBracket(tier.bracketId!, leagueId)
      if (r?.error) { setErr(r.error); return }
      router.refresh()
    })
  }

  function handleDelete() {
    if (!tier.bracketId || !confirm(`Delete the ${tier.name} bracket? This cannot be undone.`)) return
    setErr(null)
    startTransition(async () => {
      await deleteBracket(tier.bracketId!, leagueId)
      onDeleted()
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Tier header */}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            {expanded ? '▼' : '▶'}
          </button>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${colorClass}`}>
            {tier.name}
          </span>
          <span className="text-xs text-gray-400">
            Seeds {tier.seedFrom}–{tier.seedTo} · {tierCount} team{tierCount !== 1 ? 's' : ''}
          </span>
          {tier.bracket ? (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              tier.bracket.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {tier.bracket.status === 'active' ? '✓ Published' : 'Draft'}
            </span>
          ) : (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">No bracket yet</span>
          )}
        </div>

        {isOrgAdmin && tier.bracket && (
          <div className="flex items-center gap-2 shrink-0">
            {tier.bracket.status !== 'active' && (
              <button
                onClick={handlePublish}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isPending ? '…' : 'Publish'}
              </button>
            )}
            {tier.bracket.status === 'active' && (
              <button
                onClick={handlePublish}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {isPending ? '…' : 'Republish'}
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {err && <p className="px-5 pb-3 text-xs text-red-500">{err}</p>}

      {/* Bracket diagram */}
      {expanded && tier.bracket && (
        <div className="border-t px-5 py-4">
          <BracketView
            bracket={tier.bracket}
            leagueId={leagueId}
            isAdmin={isOrgAdmin}
            sport={sport}
            allTeams={allTeams}
          />
        </div>
      )}

      {expanded && !tier.bracket && (
        <div className="border-t px-5 py-6 text-center text-sm text-gray-400">
          No bracket generated yet. Use &ldquo;Generate All Brackets&rdquo; to create it.
        </div>
      )}
    </div>
  )
}

// ── Manage-mode header with ⋯ more-options dropdown ──────────────────────────

function ManageHeader({
  existingConfig,
  seededTeams,
  isOrgAdmin,
  isPending,
  onEditTiers,
  onRegenerate,
  onDeleteConfig,
}: {
  existingConfig: ExistingConfig
  seededTeams: TeamStanding[]
  isOrgAdmin: boolean
  isPending: boolean
  onEditTiers: () => void
  onRegenerate: () => void
  onDeleteConfig: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!moreOpen) return
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [moreOpen])

  const maxSeed = existingConfig.tiers.length > 0
    ? Math.max(...existingConfig.tiers.map((t) => t.seedTo))
    : 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border px-5 py-3.5">
      <div>
        <p className="font-semibold text-sm">
          {existingConfig.tiers.length} playoff tier{existingConfig.tiers.length !== 1 ? 's' : ''}
          {' · '}
          <span className="font-normal text-gray-500">
            Seeding: {existingConfig.seedingMethod === 'manual' ? 'Manual' : 'Auto (standings)'}
          </span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Seeds 1–{maxSeed} · {seededTeams.length} team{seededTeams.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {isOrgAdmin && (
        <div className="flex items-center gap-2">
          <button
            onClick={onEditTiers}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-gray-50"
          >
            ✎ Edit Tiers
          </button>

          {/* ⋯ More options */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-gray-50"
              title="More options"
            >
              ⋯
            </button>

            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[180px]">
                <button
                  onClick={() => { setMoreOpen(false); onRegenerate() }}
                  disabled={isPending}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  ↺ Regenerate from Standings
                </button>
                <div className="border-t my-1" />
                <button
                  onClick={() => { setMoreOpen(false); onDeleteConfig() }}
                  disabled={isPending}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove config…
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function PlayoffConfigWizard({
  leagueId,
  sport,
  isOrgAdmin,
  seededTeams,
  allTeams,
  recommendation,
  existingConfig,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  // ── Setup mode state ──────────────────────────────────────────────────────

  const defaultTotal = Math.min(seededTeams.length, recommendation.teamsAdvancing)
  const [totalTeams, setTotalTeams] = useState(
    existingConfig
      ? Math.max(...existingConfig.tiers.map((t) => t.seedTo), 2)
      : defaultTotal
  )
  const [tierCount, setTierCount] = useState(existingConfig ? existingConfig.tiers.length : 1)
  const [seedingMethod, setSeedingMethod] = useState<'standings' | 'manual'>(existingConfig?.seedingMethod ?? 'standings')

  // Step: 'setup' → 'tiers' → 'seed' (manual only) → manage
  const [step, setStep] = useState<'setup' | 'tiers' | 'seed'>('setup')

  // Editable tiers table
  const [tiers, setTiers] = useState<TierConfig[]>(() =>
    existingConfig
      ? existingConfig.tiers.map((t) => ({
          id: t.id,
          name: t.name,
          seedFrom: t.seedFrom,
          seedTo: t.seedTo,
          bracketType: t.bracketType,
          thirdPlaceGame: t.thirdPlaceGame,
        }))
      : buildTiersFromCount(defaultTotal, 1)
  )

  // Manual seed overrides: seed# → teamId
  const [seedOverrides, setSeedOverrides] = useState<Record<number, string>>({})

  // Manage mode: tiers that have brackets get a refresh counter
  const [refreshKey, setRefreshKey] = useState(0)

  const hasBrackets = existingConfig?.tiers.some((t) => t.bracketId !== null) ?? false

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateTier(i: number, updates: Partial<TierConfig>) {
    setTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, ...updates } : t))
  }

  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addTier() {
    const lastTo = tiers[tiers.length - 1]?.seedTo ?? 0
    const newFrom = lastTo + 1
    const newTo = Math.min(newFrom + 3, seededTeams.length || newFrom + 3)
    const nameIndex = tiers.length
    const names = TIER_PRESETS[tiers.length + 1] ?? []
    setTiers((prev) => [...prev, {
      name: names[nameIndex] ?? `Division ${tiers.length + 1}`,
      seedFrom: newFrom,
      seedTo: newTo,
      bracketType: 'single_elimination',
      thirdPlaceGame: false,
    }])
  }

  function handlePreviewSplit() {
    const built = buildTiersFromCount(totalTeams, tierCount)
    setTiers(built)
    setStep('tiers')
  }

  // ── Save config (tier definitions) ────────────────────────────────────────

  function handleSaveConfig(thenGenerate = false) {
    setErr(null)
    startTransition(async () => {
      const tierInputs: TierInput[] = tiers.map((t) => ({
        id: t.id,
        name: t.name.trim() || 'Tier',
        seedFrom: t.seedFrom,
        seedTo: t.seedTo,
        bracketType: t.bracketType,
        thirdPlaceGame: t.thirdPlaceGame,
      }))

      const r = await savePlayoffConfig({ leagueId, seedingMethod, tiers: tierInputs })
      if (r.error) { setErr(r.error); return }

      if (thenGenerate) {
        const g = await generateAllTierBrackets(leagueId, seedOverrides)
        if (g.error) { setErr(g.error); return }
        setGenMsg(`Generated ${g.generated} bracket${g.generated !== 1 ? 's' : ''}${g.skipped > 0 ? ` · ${g.skipped} skipped (in progress)` : ''}.`)
      }

      router.refresh()
    })
  }

  // ── Regenerate all ────────────────────────────────────────────────────────

  function handleRegenerate() {
    if (!confirm('Regenerate all brackets from current standings? Brackets with scores recorded will be skipped.')) return
    setErr(null)
    setGenMsg(null)
    startTransition(async () => {
      const g = await generateAllTierBrackets(leagueId, seedOverrides)
      if (g.error) { setErr(g.error); return }
      setGenMsg(`Generated ${g.generated} bracket${g.generated !== 1 ? 's' : ''}${g.skipped > 0 ? ` · ${g.skipped} skipped (scores recorded)` : ''}.`)
      setRefreshKey((k) => k + 1)
      router.refresh()
    })
  }

  // ── Delete config ─────────────────────────────────────────────────────────

  function handleDeleteConfig() {
    if (!confirm('Remove the playoff configuration? Generated brackets are not deleted.')) return
    startTransition(async () => {
      await deletePlayoffConfig(leagueId)
      // Reset wizard to fresh setup state so the user sees the wizard again
      setStep('setup')
      setTiers(buildTiersFromCount(defaultTotal, 1))
      router.refresh()
    })
  }

  // ── MANAGE MODE: config + at least one bracket exists ─────────────────────

  if (existingConfig && hasBrackets && step !== 'tiers') {
    return (
      <div className="space-y-4">
        {/* Header bar */}
        <ManageHeader
          existingConfig={existingConfig}
          seededTeams={seededTeams}
          isOrgAdmin={isOrgAdmin}
          isPending={isPending}
          onEditTiers={() => setStep('tiers')}
          onRegenerate={handleRegenerate}
          onDeleteConfig={handleDeleteConfig}
        />

        {genMsg && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-2">{genMsg}</p>
        )}
        {err && <p className="text-sm text-red-500">{err}</p>}

        {/* Per-tier bracket cards */}
        {existingConfig.tiers.map((tier) => (
          <TierBracketCard
            key={`${tier.id}-${refreshKey}`}
            tier={tier}
            leagueId={leagueId}
            sport={sport}
            allTeams={allTeams}
            isOrgAdmin={isOrgAdmin}
            onDeleted={() => setRefreshKey((k) => k + 1)}
          />
        ))}
      </div>
    )
  }

  // ── TIERS STEP: edit the tier definitions table ───────────────────────────

  if (step === 'tiers' || (existingConfig && !hasBrackets)) {
    const maxSeed = seededTeams.length || 16

    return (
      <div className="space-y-5 max-w-3xl">
        {/* Info */}
        {seededTeams.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-0.5">{seededTeams.length} teams ranked by standings</p>
            <p className="text-xs">Assign seed ranges to each tier. Every team that falls in a tier&apos;s range will be placed in that bracket.</p>
          </div>
        )}

        {/* Tier table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <span>Tier Name</span>
              <span>Seed Range</span>
              <span>Format</span>
              <span>3rd Place</span>
              <span>Teams</span>
              <span />
            </div>
          </div>
          <div className="px-4">
            {tiers.map((tier, i) => (
              <TierRow
                key={i}
                tier={tier}
                index={i}
                totalTeams={maxSeed}
                onChange={(upd) => updateTier(i, upd)}
                onRemove={() => removeTier(i)}
                canRemove={tiers.length > 1}
              />
            ))}
          </div>
          <div className="px-4 py-2 border-t">
            <button
              onClick={addTier}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <span className="text-lg leading-none">+</span> Add tier
            </button>
          </div>
        </div>

        {/* Team preview */}
        {seededTeams.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Assignments Preview</p>
            </div>
            <div className="divide-y">
              {tiers.map((tier, i) => {
                const tierTeams = seededTeams.filter(
                  (t, idx) => idx + 1 >= tier.seedFrom && idx + 1 <= tier.seedTo
                )
                return (
                  <div key={i} className="px-4 py-3 flex gap-4">
                    <span className="text-xs font-semibold text-gray-700 w-20 shrink-0">{tier.name || `Tier ${i + 1}`}</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {tierTeams.length === 0 ? (
                        <span className="text-xs text-gray-300">No teams in this range</span>
                      ) : tierTeams.map((t, ti) => (
                        <span key={t.teamId} className="text-xs text-gray-600">
                          <span className="text-gray-400">{tier.seedFrom + ti}.</span> {t.teamName}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Seeding method */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">Seeding Method</p>
          <div className="flex gap-3">
            {(['standings', 'manual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSeedingMethod(m)}
                className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors ${
                  seedingMethod === m
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <p className="font-semibold capitalize">{m === 'standings' ? 'Auto (standings)' : 'Manual'}</p>
                <p className="text-xs font-normal mt-0.5 text-gray-500">
                  {m === 'standings'
                    ? 'Seeds assigned by W-L record + point differential'
                    : 'You choose which team gets each seed'}
                </p>
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}

        <div className="flex gap-3 flex-wrap">
          {/* Generate = save config + create all bracket draws in one click */}
          <button
            onClick={() => handleSaveConfig(true)}
            disabled={isPending || tiers.length === 0}
            className="px-6 py-2.5 rounded-lg font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isPending ? 'Generating…' : 'Save & Generate Brackets →'}
          </button>
          {/* Save tier definitions without building bracket draws yet */}
          <button
            onClick={() => handleSaveConfig(false)}
            disabled={isPending}
            className="px-5 py-2.5 rounded-lg font-medium border text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {isPending ? '…' : 'Save Tiers Only'}
          </button>
          {/* Go back: returns to bracket view when brackets exist (manage mode
              triggers on any step !== 'tiers'), otherwise to setup picker */}
          <button
            onClick={() => setStep('setup')}
            className="px-4 py-2.5 rounded-lg font-medium text-gray-500 hover:bg-gray-50"
          >
            {hasBrackets ? '← View Brackets' : '← Back'}
          </button>
          {existingConfig && (
            <button
              onClick={handleDeleteConfig}
              disabled={isPending}
              className="ml-auto text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
            >
              Remove config
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── SETUP STEP: choose total teams + tier count ───────────────────────────

  const teamCountOptions = [2, 4, 6, 8, 10, 12, 16].filter((n) => n <= (seededTeams.length || 16) || seededTeams.length === 0)
  if (seededTeams.length > 0 && !teamCountOptions.includes(seededTeams.length)) {
    teamCountOptions.push(seededTeams.length)
    teamCountOptions.sort((a, b) => a - b)
  }

  const tierCountOptions = [1, 2, 3, 4].filter((n) => n <= (totalTeams / 2))

  return (
    <div className="space-y-6 max-w-xl">
      {seededTeams.length >= 2 ? (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-semibold mb-0.5">Recommended: {recommendation.reason}</p>
          <p className="text-xs text-blue-600 mt-1">
            {seededTeams.length} teams registered · You can include all of them across multiple playoff tiers so everyone plays.
          </p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">No teams registered yet</p>
          <p>You can configure the playoff structure now. Brackets will be generated once teams are registered.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border p-5 space-y-5">
        {/* How many teams advance */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            How many teams make the playoffs?
          </label>
          <div className="flex flex-wrap gap-2">
            {teamCountOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setTotalTeams(n)
                  if (tierCount > Math.floor(n / 2)) setTierCount(Math.max(1, Math.floor(n / 2)))
                }}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  totalTeams === n
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n === seededTeams.length && n !== recommendation.teamsAdvancing ? `All ${n}` : n}
              </button>
            ))}
          </div>
          {totalTeams > 0 && seededTeams.length > 0 && totalTeams < seededTeams.length && (
            <p className="text-xs text-gray-400 mt-1.5">
              {seededTeams.length - totalTeams} team{seededTeams.length - totalTeams !== 1 ? 's' : ''} will not participate in playoffs
            </p>
          )}
        </div>

        {/* How many tiers */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            How many playoff divisions (tiers)?
          </label>
          <div className="flex flex-wrap gap-2">
            {tierCountOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTierCount(n)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  tierCount === n
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n === 1 ? '1 — Championship only' : n === 2 ? `2 — ${TIER_PRESETS[2].join(' + ')}` : n === 3 ? `3 — ${TIER_PRESETS[3].join(' / ')}` : `${n} tiers`}
              </button>
            ))}
          </div>
          {tierCount > 1 && (
            <p className="text-xs text-gray-400 mt-1.5">
              All {totalTeams} teams are split across {tierCount} separate brackets — every team plays in a meaningful playoff.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={handlePreviewSplit}
        className="px-6 py-2.5 rounded-lg font-semibold text-white"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        Preview Tier Split →
      </button>
    </div>
  )
}
