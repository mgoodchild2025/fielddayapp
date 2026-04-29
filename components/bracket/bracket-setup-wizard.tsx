'use client'

import { useState, useTransition } from 'react'
import { createBracket, seedBracket, publishBracket, deleteBracket } from '@/actions/brackets'
import type { BracketRecommendation, TeamStanding } from '@/lib/bracket'
import { BracketView, type BracketData } from './bracket-view'

interface Props {
  leagueId: string
  divisionId?: string
  recommendation: BracketRecommendation
  seededTeams: TeamStanding[]    // pre-computed standings order
  existingBracket: BracketData | null
  sport?: string
}

export function BracketSetupWizard({ leagueId, divisionId, recommendation, seededTeams, existingBracket, sport }: Props) {
  const [step, setStep] = useState<'configure' | 'seed' | 'preview'>('configure')
  const [bracketId, setBracketId] = useState<string | null>(existingBracket?.id ?? null)
  const [bracket, setBracket] = useState<BracketData | null>(existingBracket)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Step 1 state
  const [bracketSize, setBracketSize] = useState(recommendation.bracketSize)
  const [teamsAdvancing, setTeamsAdvancing] = useState(recommendation.teamsAdvancing)
  const [thirdPlace, setThirdPlace] = useState(false)
  const [name, setName] = useState(divisionId ? 'Division Playoffs' : 'Playoffs')

  // Step 2 state — seed order (index = seed-1, value = teamId)
  const [seedOrder, setSeedOrder] = useState<string[]>(seededTeams.slice(0, teamsAdvancing).map((t) => t.teamId))

  // If bracket already exists, skip to preview
  const currentStep = bracket ? 'preview' : step

  function handleTeamsAdvancingChange(n: number) {
    setTeamsAdvancing(n)
    // Rebuild seed order from seededTeams for the new count
    setSeedOrder(seededTeams.slice(0, n).map((t) => t.teamId))
  }

  function swapSeeds(i: number, j: number) {
    setSeedOrder((prev) => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function handleCreate() {
    setErr(null)
    startTransition(async () => {
      const res = await createBracket({
        leagueId,
        divisionId,
        name,
        bracketType: 'single_elimination',
        seedingMethod: 'standings',
        bracketSize,
        teamsAdvancing,
        thirdPlaceGame: thirdPlace,
      })
      if (res.error) { setErr(res.error); return }
      setBracketId(res.bracketId)
      setStep('seed')
    })
  }

  function handleSeed() {
    if (!bracketId) return
    setErr(null)
    const overrides: Record<number, string> = {}
    seedOrder.forEach((teamId, i) => { overrides[i + 1] = teamId })
    startTransition(async () => {
      const res = await seedBracket(bracketId, leagueId, overrides)
      if (res.error) { setErr(res.error); return }
      // Reload page to get fresh bracket data
      window.location.reload()
    })
  }

  function handlePublish() {
    if (!bracketId) return
    setErr(null)
    startTransition(async () => {
      const res = await publishBracket(bracketId, leagueId)
      if (res.error) { setErr(res.error); return }
      window.location.reload()
    })
  }

  function handleDelete() {
    if (!bracketId || !confirm('Delete this bracket and all match data? This cannot be undone.')) return
    setErr(null)
    startTransition(async () => {
      await deleteBracket(bracketId, leagueId)
      setBracketId(null)
      setBracket(null)
      setStep('configure')
      window.location.reload()
    })
  }

  const teamById = new Map(seededTeams.map((t) => [t.teamId, t.teamName]))

  // ── Preview (bracket exists) ────────────────────────────────────────────────
  if (bracket) {
    return (
      <div className="space-y-6">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg border p-4">
          <div>
            <p className="font-semibold">{bracket.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {bracket.status === 'active' ? '✓ Published — visible to the public' : 'Draft — only visible to admins'}
            </p>
          </div>
          <div className="flex gap-2">
            {bracket.status !== 'active' && (
              <button
                onClick={handlePublish}
                disabled={isPending}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isPending ? 'Publishing…' : 'Publish Bracket'}
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="px-4 py-2 rounded-md text-sm font-medium border text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <BracketView bracket={bracket} leagueId={leagueId} isAdmin sport={sport} />
      </div>
    )
  }

  // ── Step 1: Configure ────────────────────────────────────────────────────────
  if (currentStep === 'configure') {
    return (
      <div className="space-y-6 max-w-xl">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">Recommended</p>
          <p>{recommendation.reason}</p>
        </div>

        <div className="bg-white rounded-lg border p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bracket Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teams Advancing to Playoffs</label>
            <select
              value={teamsAdvancing}
              onChange={(e) => {
                const n = Number(e.target.value)
                setTeamsAdvancing(n)
                setBracketSize(Math.pow(2, Math.ceil(Math.log2(n))))
                handleTeamsAdvancingChange(n)
              }}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {[2, 4, 6, 8, 12, 16].filter((n) => n <= seededTeams.length).map((n) => (
                <option key={n} value={n}>{n} teams{n % (Math.pow(2, Math.ceil(Math.log2(n)))) !== 0 ? ` (${Math.pow(2, Math.ceil(Math.log2(n))) - n} bye${Math.pow(2, Math.ceil(Math.log2(n))) - n > 1 ? 's' : ''})` : ''}</option>
              ))}
            </select>
            {bracketSize !== teamsAdvancing && (
              <p className="text-xs text-gray-500 mt-1">
                Bracket size: {bracketSize} slots — top {bracketSize - teamsAdvancing} seed{bracketSize - teamsAdvancing > 1 ? 's' : ''} receive{bracketSize - teamsAdvancing === 1 ? 's' : ''} a first-round bye.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => setThirdPlace(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Include third place game</span>
          </label>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <button
          onClick={handleCreate}
          disabled={isPending || !name.trim()}
          className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Creating…' : 'Continue to Seedings →'}
        </button>
      </div>
    )
  }

  // ── Step 2: Review seedings ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-xl">
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <p className="text-sm font-semibold">Review Seedings</p>
          <p className="text-xs text-gray-500 mt-0.5">Auto-calculated from standings. Use ↑ ↓ to adjust any seed.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Seed</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Team</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">W-L</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Pt Diff</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {seedOrder.map((teamId, i) => {
              const team = seededTeams.find((t) => t.teamId === teamId)
              const isBye = i >= teamsAdvancing
              return (
                <tr key={teamId} className={`border-b last:border-0 ${isBye ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-bold text-gray-400 w-10">#{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{teamById.get(teamId) ?? teamId}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{team ? `${team.wins}-${team.losses}` : '—'}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{team ? `${(team.pointsFor - team.pointsAgainst) >= 0 ? '+' : ''}${team.pointsFor - team.pointsAgainst}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => swapSeeds(i, i - 1)}
                        disabled={i === 0}
                        className="w-6 h-6 text-xs border rounded hover:bg-gray-50 disabled:opacity-20"
                        title="Move up"
                      >↑</button>
                      <button
                        onClick={() => swapSeeds(i, i + 1)}
                        disabled={i === seedOrder.length - 1}
                        className="w-6 h-6 text-xs border rounded hover:bg-gray-50 disabled:opacity-20"
                        title="Move down"
                      >↓</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSeed}
          disabled={isPending}
          className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isPending ? 'Generating…' : 'Generate Bracket'}
        </button>
        <button
          onClick={() => { setStep('configure'); setBracketId(null) }}
          className="px-4 py-2.5 rounded-md font-medium border text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    </div>
  )
}
