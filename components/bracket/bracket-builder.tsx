'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Check } from 'lucide-react'
import {
  addBracketMatch, deleteBracketMatch, addBracketRound, deleteBracketRound,
  renameBracketRound, toggleMatchBye,
} from '@/actions/brackets'
import { roundDisplayName } from '@/lib/bracket'
import type { BracketData } from './bracket-view'

/**
 * Structure panel for hand-built (custom) brackets — manual brackets M2.
 *
 * Rounds and matches are created, named and removed here; teams and routes are
 * edited on the matches themselves (Edit Match). Rounds count down internally
 * (round 1 = the final) but the admin only ever sees "earlier" and "next".
 */
export function BracketBuilder({ bracket, leagueId }: { bracket: BracketData; leagueId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingRound, setAddingRound] = useState<'earlier' | 'later' | null>(null)
  const [newRoundMatches, setNewRoundMatches] = useState('2')
  const [newRoundName, setNewRoundName] = useState('')
  const [confirmDeleteRound, setConfirmDeleteRound] = useState<number | null>(null)

  const roundNumbers = Array.from(new Set(bracket.matches.map((m) => m.roundNumber)))
    .sort((a, b) => b - a) // earliest round (largest number) first, final last

  function run(action: () => Promise<{ error: string | null } | { error: string | null; matchId?: string | null; roundNumber?: number | null }>) {
    setErr(null)
    startTransition(async () => {
      const r = await action()
      if (r.error) { setErr(r.error); return }
      router.refresh()
    })
  }

  function submitRename(rn: number) {
    setRenaming(null)
    run(() => renameBracketRound({ bracketId: bracket.id, leagueId, roundNumber: rn, name: renameValue }))
  }

  function submitAddRound(where: 'earlier' | 'later') {
    const matchCount = Math.max(1, parseInt(newRoundMatches) || 1)
    setAddingRound(null)
    setNewRoundName('')
    run(() => addBracketRound({ bracketId: bracket.id, leagueId, where, matchCount, name: newRoundName.trim() || undefined }))
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Structure — hand-built</p>
        <p className="text-[11px] text-gray-400">Seat teams &amp; set routes on each match (✎)</p>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="space-y-1.5">
        {roundNumbers.map((rn) => {
          const roundMatches = bracket.matches
            .filter((m) => m.roundNumber === rn)
            .sort((a, b) => a.matchNumber - b.matchNumber)
          const name = roundDisplayName(bracket.roundNames, rn, bracket.bracketSize)
          const hasScores = roundMatches.some((m) => m.status === 'completed')

          return (
            <div key={rn} className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-white border rounded-md px-2.5 py-1.5">
              {/* Round name + rename */}
              {renaming === rn ? (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitRename(rn); if (e.key === 'Escape') setRenaming(null) }}
                    placeholder={name}
                    className="border rounded px-1.5 py-0.5 text-xs w-36"
                  />
                  <button type="button" onClick={() => submitRename(rn)} className="text-green-600 hover:text-green-700" aria-label="Save round name">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setRenaming(rn); setRenameValue(bracket.roundNames?.[String(rn)] ?? '') }}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900"
                  title="Rename round (empty resets to the automatic name)"
                >
                  {name}
                  <Pencil className="w-3 h-3 text-gray-300" />
                </button>
              )}

              {/* Matches */}
              <span className="flex flex-wrap items-center gap-1 ml-1">
                {roundMatches.map((m) => (
                  <span key={m.id} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${m.status === 'completed' ? 'border-gray-200 bg-gray-100 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                    M{m.matchNumber}
                    {m.status !== 'completed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => run(() => toggleMatchBye({ matchId: m.id, bracketId: bracket.id, leagueId, isBye: !m.isBye }))}
                          disabled={isPending}
                          className={m.isBye ? 'text-amber-600 font-medium' : 'text-gray-300 hover:text-amber-600'}
                          title={m.isBye ? 'Convert back to a normal match' : 'Convert to a bye (team 1 advances)'}
                        >
                          bye
                        </button>
                        <button
                          type="button"
                          onClick={() => run(() => deleteBracketMatch({ matchId: m.id, bracketId: bracket.id, leagueId }))}
                          disabled={isPending}
                          className="text-gray-300 hover:text-red-500"
                          title="Delete match"
                          aria-label={`Delete match ${m.matchNumber}`}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => run(() => addBracketMatch({ bracketId: bracket.id, leagueId, roundNumber: rn }))}
                  disabled={isPending}
                  className="inline-flex items-center rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-600 hover:border-gray-400"
                  title="Add a match to this round"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </span>

              {/* Delete round */}
              <span className="ml-auto">
                {confirmDeleteRound === rn ? (
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-gray-500">Delete round?</span>
                    <button
                      type="button"
                      onClick={() => { setConfirmDeleteRound(null); run(() => deleteBracketRound({ bracketId: bracket.id, leagueId, roundNumber: rn })) }}
                      className="font-medium text-red-600 hover:text-red-700"
                    >
                      Yes
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteRound(null)} className="text-gray-400 hover:text-gray-600">No</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRound(rn)}
                    disabled={isPending || hasScores}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-30"
                    title={hasScores ? 'A match in this round has a score' : 'Delete this round and its matches'}
                    aria-label="Delete round"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </div>
          )
        })}
        {roundNumbers.length === 0 && (
          <p className="text-xs text-gray-400 px-1">No rounds yet — add the first one below.</p>
        )}
      </div>

      {/* Add round */}
      {addingRound ? (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-white border rounded-md px-2.5 py-1.5">
          <span className="text-gray-500">{addingRound === 'earlier' ? 'New earlier round:' : 'New next round:'}</span>
          <label className="flex items-center gap-1 text-gray-500">
            matches
            <input
              type="number" min="1" max="64"
              value={newRoundMatches}
              onChange={(e) => setNewRoundMatches(e.target.value)}
              className="border rounded px-1.5 py-0.5 w-14 text-xs"
            />
          </label>
          <input
            value={newRoundName}
            onChange={(e) => setNewRoundName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAddRound(addingRound); if (e.key === 'Escape') setAddingRound(null) }}
            placeholder="Round name (optional)"
            className="border rounded px-1.5 py-0.5 text-xs w-40"
          />
          <button
            type="button"
            onClick={() => submitAddRound(addingRound)}
            disabled={isPending}
            className="font-medium text-white rounded px-2 py-0.5 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Add
          </button>
          <button type="button" onClick={() => setAddingRound(null)} className="text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddingRound('earlier')}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
            title="Add a round before the current first round"
          >
            <Plus className="w-3.5 h-3.5" /> Earlier round
          </button>
          <button
            type="button"
            onClick={() => setAddingRound('later')}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
            title="Add a round after the current last round, toward the final"
          >
            <Plus className="w-3.5 h-3.5" /> Next round
          </button>
        </div>
      )}
    </div>
  )
}
