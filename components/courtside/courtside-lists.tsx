import { CalendarX } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { ExhibitionBadge } from '@/components/schedule/game-kind-badge'
import { roundDisplayName } from '@/lib/bracket'
import type { CourtsideBracketMatch, CourtsideDayData, CourtsideGame, CourtsideItem } from '@/lib/courtside-day'

/**
 * The day's score cards — Needs a score · Waiting for confirmation · Scored —
 * shared by admin Courtside and the volunteers' Scorekeeping page. Each game
 * opens the score sheet (all sport scoring modes) or the scoreboard; playoff
 * matches open the scoreboard (recordBracketScore advances the winner).
 */
export function CourtsideLists({
  day,
  tz,
  canClear,
  emptyHint,
}: {
  day: CourtsideDayData
  tz: string
  /** false for scorekeepers (see AdminScoreEntry). */
  canClear: boolean
  emptyHint: string
}) {
  const timeStr = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(new Date(iso))

  const GameCard = ({ g }: { g: CourtsideGame }) => (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span className="flex items-center gap-1.5">
          {timeStr(g.scheduled_at)}{g.court ? ` · ${g.court}` : ''}
          <ExhibitionBadge isExhibition={!!g.is_exhibition} />
        </span>
        <span className="truncate max-w-[45%]">{g.league?.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TeamAvatar logoUrl={g.home?.logo_url ?? null} color={g.home?.color ?? null} name={g.home?.name ?? 'TBD'} size="sm" />
          <span className="truncate text-sm font-semibold">{g.home?.name ?? 'TBD'}</span>
        </div>
        <span className="shrink-0 px-2 text-lg font-bold tabular-nums">
          {g.result && g.result.home_score !== null ? `${g.result.home_score} – ${g.result.away_score}` : 'vs'}
        </span>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
          <span className="truncate text-sm font-semibold">{g.away?.name ?? 'TBD'}</span>
          <TeamAvatar logoUrl={g.away?.logo_url ?? null} color={g.away?.color ?? null} name={g.away?.name ?? 'TBD'} size="sm" />
        </div>
      </div>
      {g.home && g.away && (
        <div className="mt-3">
          <AdminScoreEntry
            gameId={g.id}
            leagueId={g.league_id as string}
            sport={g.league?.sport ?? undefined}
            homeTeamName={g.home.name}
            awayTeamName={g.away.name}
            existingResult={g.result ? { homeScore: g.result.home_score, awayScore: g.result.away_score, status: g.result.status, sets: g.result.sets ?? null } : null}
            compact
            large
            canClear={canClear}
          />
          <a
            href={`/scoreboard?game=${g.id}`}
            className="press mt-2 flex items-center justify-center min-h-11 rounded-lg border text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            🔢 Open scoreboard →
          </a>
        </div>
      )}
    </div>
  )

  const BracketCard = ({ m }: { m: CourtsideBracketMatch }) => (
    <div className="rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>{timeStr(m.scheduled_at)}{m.court ? ` · ${m.court}` : ''}</span>
        <span className="truncate max-w-[55%] text-amber-700 font-semibold">
          🏆 {m.bracket?.name} · {roundDisplayName(m.bracket?.round_names ?? null, m.round_number, m.bracket?.bracket_size ?? 0, m.match_number)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TeamAvatar logoUrl={m.team1?.logo_url ?? null} color={m.team1?.color ?? null} name={m.team1?.name ?? 'TBD'} size="sm" />
          <span className="truncate text-sm font-semibold">{m.team1?.name ?? 'TBD'}</span>
        </div>
        <span className="shrink-0 px-2 text-lg font-bold tabular-nums">
          {m.status === 'completed' && m.score1 !== null ? `${m.score1} – ${m.score2}` : 'vs'}
        </span>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
          <span className="truncate text-sm font-semibold">{m.team2?.name ?? 'TBD'}</span>
          <TeamAvatar logoUrl={m.team2?.logo_url ?? null} color={m.team2?.color ?? null} name={m.team2?.name ?? 'TBD'} size="sm" />
        </div>
      </div>
      {/* A scorekeeper can't rewrite a played playoff match (the winner has
          moved on) — the board would only refuse it. */}
      {(canClear || m.status !== 'completed') && (
        <a
          href={`/scoreboard?match=${m.id}`}
          className="press mt-3 flex items-center justify-center min-h-11 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          🔢 Open scoreboard →
        </a>
      )}
    </div>
  )

  const renderItem = (item: CourtsideItem) =>
    item.kind === 'game' ? <GameCard key={item.row.id} g={item.row} /> : <BracketCard key={item.row.id} m={item.row} />

  return (
    <>
      {day.games.length === 0 && day.bracketMatches.length === 0 && (
        <EmptyState icon={CalendarX} title="No games scheduled this day" hint={emptyHint} />
      )}
      {day.unscored.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Needs a score · {day.unscored.length}</h2>
          {day.unscored.map(renderItem)}
        </div>
      )}
      {day.awaiting.length > 0 && (
        <div className="space-y-3 mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waiting for confirmation · {day.awaiting.length}</h2>
          {day.awaiting.map(renderItem)}
        </div>
      )}
      {day.scored.length > 0 && (
        <div className="space-y-3 mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scored · {day.scored.length}</h2>
          {day.scored.map(renderItem)}
        </div>
      )}
    </>
  )
}
