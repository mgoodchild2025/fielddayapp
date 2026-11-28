'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { giveKudos } from '@/actions/kudos'
import { safeAction } from '@/lib/action-errors'
import { announce } from '@/lib/announce'
import { KUDOS_KINDS, kudosMeta, summarizeKudos } from '@/lib/kudos'

export interface KudosPlayer { userId: string; name: string }

/**
 * Game page → Kudos: tap a teammate or an opponent, pick a compliment from a
 * fixed list. One per player per game (tap another to change it). The
 * viewer's own kudos from this game show underneath.
 */
export function KudosPanel({ gameId, open, teams, given: initialGiven, received }: {
  gameId: string
  /** Giving is open (from the start of the game for 3 days). */
  open: boolean
  teams: { name: string; mine: boolean; players: KudosPlayer[] }[]
  /** toUserId → kind the viewer already gave in this game. */
  given: Record<string, string>
  /** Kinds the viewer received in this game. */
  received: string[]
}) {
  const [given, setGiven] = useState(initialGiven)
  const [picking, setPicking] = useState<KudosPlayer | null>(null)
  const [pending, start] = useTransition()
  const summary = summarizeKudos(received)
  const sentCount = Object.keys(given).length

  function send(player: KudosPlayer, kind: string) {
    const before = given[player.userId]
    setGiven((g) => ({ ...g, [player.userId]: kind }))
    setPicking(null)
    start(async () => {
      const res = await safeAction(giveKudos({ gameId, toUserId: player.userId, kind }))
      if (res.error) {
        setGiven((g) => {
          const next = { ...g }
          if (before) next[player.userId] = before
          else delete next[player.userId]
          return next
        })
        toast.error(res.error)
        return
      }
      const m = kudosMeta(kind)
      announce(`Kudos sent to ${player.name}: ${m.label}`)
      if (!before) toast.success(`${m.emoji} Kudos sent to ${player.name}`)
    })
  }

  if (!open && summary.length === 0) return null

  return (
    <section id="kudos" className="mt-6 scroll-mt-20 bg-white border rounded-xl p-4" aria-labelledby="kudos-heading">
      <h2 id="kudos-heading" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kudos 👏</h2>

      {summary.length > 0 && (
        <p className="mt-2 text-sm text-gray-800">
          <span className="font-semibold">You got kudos this game: </span>
          {summary.map((k) => `${k.emoji} ${k.label}${k.count > 1 ? ` ×${k.count}` : ''}`).join(' · ')}
        </p>
      )}

      {open && (
        <>
          <p className="mt-2 text-sm text-gray-600">
            Shout out a teammate or someone on the other team. Tap a name, then pick one.
            {sentCount > 0 && <span className="text-gray-500"> You&apos;ve sent {sentCount}.</span>}
          </p>
          {teams.map((t) => t.players.length > 0 && (
            <div key={t.name} className="mt-3">
              <p className="text-xs font-semibold text-gray-500">{t.mine ? `Your team · ${t.name}` : t.name}</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {t.players.map((p) => {
                  const kind = given[p.userId]
                  const selected = picking?.userId === p.userId
                  return (
                    <li key={p.userId}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPicking(selected ? null : p)}
                        className={`press min-h-10 rounded-full border px-3 text-sm font-medium ${
                          selected ? 'border-brand-primary ring-2 ring-brand-primary/40 bg-white'
                          : kind ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        {kind ? <span aria-hidden>{kudosMeta(kind).emoji} </span> : null}
                        {p.name}
                        {kind && <span className="sr-only"> (kudos sent: {kudosMeta(kind).label})</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {picking && t.players.some((p) => p.userId === picking.userId) && (
                <div className="fd-fade-in mt-2 rounded-lg bg-gray-50 p-2" role="group" aria-label={`Kudos for ${picking.name}`}>
                  <p className="px-1 pb-1.5 text-xs text-gray-600">Kudos for <span className="font-semibold">{picking.name}</span></p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {KUDOS_KINDS.map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        disabled={pending}
                        aria-pressed={given[picking.userId] === k.kind}
                        onClick={() => send(picking, k.kind)}
                        className={`press min-h-11 rounded-lg border px-2 text-sm font-semibold ${
                          given[picking.userId] === k.kind ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        <span aria-hidden>{k.emoji} </span>{k.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}
