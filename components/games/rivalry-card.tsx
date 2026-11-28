import { Flame } from 'lucide-react'
import { rivalryRecord, type Rivalry } from '@/lib/rivalry'

/**
 * All-time record between two teams (by name, across seasons) on the game
 * page. Side A is the viewer's team when they're on one ("Your record vs …"),
 * else the home team. Server-rendered: dates take the org timezone.
 */
export function RivalryCard({ rivalry, aName, bName, mine, timeZone }: {
  rivalry: Rivalry
  aName: string
  bName: string
  /** True when side A is the viewer's own team. */
  mine: boolean
  timeZone: string
}) {
  const r = rivalry
  const last = r.last
  const lastDate = last
    ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(new Date(last.at))
    : null
  const lastScore = last && last.a != null && last.b != null ? ` ${last.a}–${last.b}` : ''
  const lastWord = last ? (last.outcome === 'T' ? 'Tie' : mine ? last.outcome : last.outcome === 'W' ? `${aName} won` : `${bName} won`) : ''
  const runText = r.run
    ? r.run.side === 'a'
      ? `${mine ? "You've" : `${aName} has`} won the last ${r.run.count}`
      : `${bName} has won the last ${r.run.count}`
    : null

  return (
    <section className="mt-6 bg-white border rounded-xl p-4" aria-labelledby="rivalry-heading">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
        <Flame className="w-4 h-4" aria-hidden /> Rivalry
      </p>
      <h2 id="rivalry-heading" className="mt-1 text-sm text-gray-700">
        {mine ? <>Your record vs <span className="font-semibold text-gray-900">{bName}</span></> : <><span className="font-semibold text-gray-900">{aName}</span> vs <span className="font-semibold text-gray-900">{bName}</span></>}
      </h2>
      <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
        {rivalryRecord(r)} <span className="text-base font-medium text-gray-500">all-time</span>
      </p>
      <p className="mt-1 text-sm text-gray-600">
        {r.meetings} {r.meetings === 1 ? 'meeting' : 'meetings'} in {r.events} events{r.sinceYear ? ` since ${r.sinceYear}` : ''}
        {runText ? ` · ${runText}` : ''}
      </p>
      {last && (
        <p className="mt-0.5 text-xs text-gray-500">
          Last met {lastDate} ({last.eventName}): {lastWord}{lastScore}
        </p>
      )}
    </section>
  )
}
