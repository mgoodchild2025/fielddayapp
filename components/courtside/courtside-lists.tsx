'use client'

import { useMemo, useState } from 'react'
import { CalendarX, ChevronDown, Search, X } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminScoreEntry } from '@/components/scores/admin-score-entry'
import { TeamAvatar } from '@/components/ui/team-avatar'
import { ExhibitionBadge } from '@/components/schedule/game-kind-badge'
import { Collapse } from '@/components/ui/collapse'
import { roundDisplayName } from '@/lib/bracket'
import { announce } from '@/lib/announce'
import {
  COURT_COOKIE, courtKey, listCourts, matchesSearch, planCourt, type OrderItem,
} from '@/lib/courtside-order'
import type { CourtsideBracketMatch, CourtsideDayData, CourtsideGame, CourtsideItem } from '@/lib/courtside-day'

const ALL = '*'

/**
 * The day's score cards, shared by admin Courtside and the volunteers'
 * Scorekeeping page. Built for a busy tournament: pick your court once (the
 * phone remembers it for the day) and the game on now sits on top, the next
 * one under it, the rest folded away; earlier games still missing a score are
 * set apart so tonight's result doesn't go into them. Search finds a team on
 * any court. Each card carries its court and time in large type, and so does
 * the score sheet it opens.
 */
export function CourtsideLists({
  day,
  tz,
  canClear,
  emptyHint,
  initialCourt,
  focusId,
}: {
  day: CourtsideDayData
  tz: string
  /** false for scorekeepers (see AdminScoreEntry). */
  canClear: boolean
  emptyHint: string
  /** This device's court for the day (from the cookie), or null for all courts. */
  initialCourt: string | null
  /** A game opened from a score sheet's QR code (`?game=`): shown on its own first. */
  focusId?: string | null
}) {
  const courts = useMemo(() => listCourts([...day.games, ...day.bracketMatches]), [day])
  const [court, setCourt] = useState<string>(initialCourt ?? ALL)
  const [query, setQuery] = useState('')
  const [showLater, setShowLater] = useState(false)
  const [openScored, setOpenScored] = useState<Set<string>>(() => new Set())
  const [focus, setFocus] = useState<string | null>(focusId ?? null)

  const showChips = courts.length >= 2
  const activeCourt = showChips && court !== ALL && courts.some((c) => c.key === court) ? court : null
  const activeLabel = courts.find((c) => c.key === activeCourt)?.label ?? null

  function chooseCourt(key: string) {
    setCourt(key)
    setShowLater(false)
    rememberCourt(day.date, key)
    announce(key === ALL ? 'Showing all courts' : `Showing ${courts.find((c) => c.key === key)?.label ?? 'court'}`)
  }

  const cardCtx: CardCtx = { tz, canClear }
  const openRow = (id: string) => setOpenScored((prev) => new Set(prev).add(id))

  // ── What to show ───────────────────────────────────────────────────────────
  const everything = [...day.unscored, ...day.awaiting, ...day.scored]
  const q = query.trim()
  const pick = (items: CourtsideItem[]) => (activeCourt === null ? items : items.filter((i) => courtKey(i.row.court) === activeCourt))

  const focused = focus ? everything.find((i) => i.row.id === focus) ?? null : null

  let body: React.ReactNode
  if (focused && !q) {
    // Scanned from a printed score sheet: that one game, nothing to hunt for.
    body = (
      <>
        <Section title="Scanned game" tone="brand"><Card ctx={cardCtx} item={focused} highlight /></Section>
        <button
          type="button"
          onClick={() => setFocus(null)}
          className="press mt-6 w-full min-h-11 rounded-xl border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Show every game today
        </button>
      </>
    )
  } else if (everything.length === 0) {
    body = <EmptyState icon={CalendarX} title="No games scheduled this day" hint={emptyHint} />
  } else if (q) {
    const hits = everything.filter((i) => matchesSearch(orderOf(i), q)).sort((a, b) => a.when.localeCompare(b.when))
    body = hits.length === 0
      ? <EmptyState icon={Search} title={`No games for “${q}” this day`} hint="Check the spelling, or clear the search to see every game." />
      : <Section title={`${hits.length} game${hits.length === 1 ? '' : 's'} for “${q}”`}>{hits.map((i) => <Card key={i.row.id} ctx={cardCtx} item={i} />)}</Section>
  } else if (activeCourt !== null) {
    const plan = planCourt(pick(day.unscored), day.nowMs)
    const awaiting = pick(day.awaiting)
    const scored = pick(day.scored)
    body = (
      <>
        {plan.now && (
          <Section title="On now" tone="brand"><Card ctx={cardCtx} item={plan.now} highlight /></Section>
        )}
        {plan.next && (
          <Section title={plan.now ? 'Up next' : 'First game'}><Card ctx={cardCtx} item={plan.next} highlight={!plan.now} /></Section>
        )}
        {plan.missed.length > 0 && (
          <Section title={`Earlier — still needs a score · ${plan.missed.length}`} tone="amber">
            {plan.missed.map((i) => <Card key={i.row.id} ctx={cardCtx} item={i} />)}
          </Section>
        )}
        {awaiting.length > 0 && (
          <Section title={`Waiting for confirmation · ${awaiting.length}`} tone="amber">
            {awaiting.map((i) => <Card key={i.row.id} ctx={cardCtx} item={i} />)}
          </Section>
        )}
        {plan.later.length > 0 && (
          <section className="mt-6">
            <button
              type="button"
              onClick={() => setShowLater((v) => !v)}
              aria-expanded={showLater}
              className="press w-full flex items-center justify-between min-h-11 px-4 rounded-xl border bg-white text-sm font-semibold text-gray-700"
            >
              Later today · {plan.later.length}
              <ChevronDown className={`w-4 h-4 transition-transform ${showLater ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            <Collapse open={showLater}>
              <div className="space-y-3 pt-3">{plan.later.map((i) => <Card key={i.row.id} ctx={cardCtx} item={i} />)}</div>
            </Collapse>
          </section>
        )}
        {scored.length > 0 && (
          <Section title={`Scored · ${scored.length}`}>{scored.map((i) => <ScoredRow key={i.row.id} ctx={cardCtx} item={i} open={openScored.has(i.row.id)} onOpen={openRow} />)}</Section>
        )}
        {!plan.now && !plan.next && plan.missed.length === 0 && awaiting.length === 0 && scored.length === 0 && (
          <EmptyState icon={CalendarX} title={`No games on ${activeLabel} this day`} hint="Pick another court above." />
        )}
      </>
    )
  } else {
    body = (
      <>
        {day.unscored.length > 0 && (
          <Section title={`Needs a score · ${day.unscored.length}`}>{day.unscored.map((i) => <Card key={i.row.id} ctx={cardCtx} item={i} />)}</Section>
        )}
        {day.awaiting.length > 0 && (
          <Section title={`Waiting for confirmation · ${day.awaiting.length}`} tone="amber">{day.awaiting.map((i) => <Card key={i.row.id} ctx={cardCtx} item={i} />)}</Section>
        )}
        {day.scored.length > 0 && (
          <Section title={`Scored · ${day.scored.length}`}>{day.scored.map((i) => <ScoredRow key={i.row.id} ctx={cardCtx} item={i} open={openScored.has(i.row.id)} onOpen={openRow} />)}</Section>
        )}
      </>
    )
  }

  return (
    <div>
      {everything.length > 0 && (
        <div className="mb-5 space-y-3">
          {showChips && (
            <div role="group" aria-label="Court" className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1">
              {[{ key: ALL, label: 'All courts' }, ...courts].map((c) => {
                const selected = c.key === ALL ? activeCourt === null : activeCourt === c.key
                return (
                  <button
                    key={c.key || 'none'}
                    type="button"
                    onClick={() => chooseCourt(c.key)}
                    aria-pressed={selected}
                    className={`press shrink-0 min-h-11 px-4 rounded-full border text-sm font-semibold whitespace-nowrap ${selected ? 'bg-brand-primary text-on-brand border-transparent' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
            <input
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a team"
              aria-label="Find a team"
              autoComplete="off"
              className="w-full min-h-11 rounded-lg border bg-white pl-9 pr-10 text-base"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-10 min-w-10 inline-flex items-center justify-center text-gray-500">
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>
          {activeCourt !== null && !q && (
            <p className="text-xs text-gray-500">Showing {activeLabel} only — this phone remembers it for today.</p>
          )}
        </div>
      )}
      {body}
    </div>
  )
}

/** Remembered for this day on this device (the page reads it on the next load). */
function rememberCourt(date: string, key: string) {
  document.cookie = `${COURT_COOKIE}=${encodeURIComponent(`${date}|${key}`)}; path=/; max-age=${60 * 60 * 18}; samesite=lax`
}

// ── Cards (module scope: defined inside the list they'd remount on every
// render, closing an open score sheet) ─────────────────────────────────────

type CardCtx = { tz: string; canClear: boolean }

const courtLabel = (c: string | null) => (c && c.trim() ? c.trim().replace(/\s+/g, ' ') : null)
/** "Court 3 · 10:30 a.m." — times come formatted from the server (org zone; no hydration drift). */
const whereWhen = (c: string | null, time: string) => [courtLabel(c), time].filter(Boolean).join(' · ')

function orderOf(item: CourtsideItem): OrderItem {
  return item.kind === 'game'
    ? { id: item.row.id, when: item.when, court: item.row.court, teams: [item.row.home?.name ?? item.row.homeLabel ?? 'TBD', item.row.away?.name ?? item.row.awayLabel ?? 'TBD'] }
    : { id: item.row.id, when: item.when, court: item.row.court, teams: [item.row.team1?.name ?? 'TBD', item.row.team2?.name ?? 'TBD'] }
}

function CardHeader({ courtName, time, right }: { courtName: string | null; time: string; right: React.ReactNode }) {
  const c = courtLabel(courtName)
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <p className="min-w-0 text-sm">
        {c && <span className="font-bold text-gray-900">{c}</span>}
        {c && <span className="text-gray-400"> · </span>}
        <span className="font-semibold text-gray-700 tabular-nums">{time}</span>
      </p>
      <span className="truncate max-w-[50%] text-xs text-gray-500">{right}</span>
    </div>
  )
}

function Teams({ a, b, score, aLabel, bLabel }: { a: CourtsideGame['home']; b: CourtsideGame['home']; score: string | null; aLabel?: string | null; bLabel?: string | null }) {
  const aName = a?.name ?? aLabel ?? 'TBD'
  const bName = b?.name ?? bLabel ?? 'TBD'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <TeamAvatar logoUrl={a?.logo_url ?? null} color={a?.color ?? null} name={aName} size="sm" />
        <span className="truncate text-base font-semibold">{aName}</span>
      </div>
      <span className="shrink-0 px-2 text-lg font-bold tabular-nums">{score ?? 'vs'}</span>
      <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
        <span className="truncate text-base font-semibold">{bName}</span>
        <TeamAvatar logoUrl={b?.logo_url ?? null} color={b?.color ?? null} name={bName} size="sm" />
      </div>
    </div>
  )
}

function EnteredBy({ text }: { text: string | null }) {
  return text ? <p className="mt-2 text-xs text-gray-500">{text}</p> : null
}

/**
 * A side with a typed name but no team (a CSV name that didn't match): it
 * can't be scored — a result needs real teams to count — so say why and
 * where to fix it instead of a silent "TBD".
 */
function UnlinkedNote({ ctx, g }: { ctx: CardCtx; g: CourtsideGame }) {
  const names = [!g.home ? g.homeLabel : null, !g.away ? g.awayLabel : null].filter(Boolean) as string[]
  if (names.length === 0) return null
  const who = names.join(' and ')
  return (
    <div role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p>
        <span className="font-semibold">{who}</span> {names.length > 1 ? 'aren’t' : 'isn’t'} linked to a team yet, so this game can’t be scored.
      </p>
      {ctx.canClear && g.league_id ? (
        <a href={`/admin/events/${g.league_id}/schedule`} className="mt-1 inline-block font-semibold underline">
          Link it on the schedule →
        </a>
      ) : (
        <p className="mt-1">Ask an organizer to link it on the event’s schedule.</p>
      )}
    </div>
  )
}

function GameCard({ ctx, g, highlight }: { ctx: CardCtx; g: CourtsideGame; highlight?: boolean }) {
  const scored = !!g.result && g.result.home_score !== null
  return (
    <div className={`rounded-xl border bg-white p-4 ${highlight ? 'ring-2 ring-brand-primary border-transparent' : ''}`}>
      <CardHeader
        courtName={g.court}
        time={g.timeLabel}
        right={<span className="inline-flex items-center gap-1.5"><ExhibitionBadge isExhibition={!!g.is_exhibition} />{g.league?.name}</span>}
      />
      <Teams a={g.home} b={g.away} aLabel={g.homeLabel} bLabel={g.awayLabel} score={scored ? `${g.result!.home_score} – ${g.result!.away_score}` : null} />
      <EnteredBy text={g.enteredBy} />
      <UnlinkedNote ctx={ctx} g={g} />
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
            canClear={ctx.canClear}
            contextLabel={whereWhen(g.court, g.timeLabel)}
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
}

function BracketCard({ ctx, m, highlight }: { ctx: CardCtx; m: CourtsideBracketMatch; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-amber-200 bg-white p-4 ${highlight ? 'ring-2 ring-brand-primary' : ''}`}>
      <CardHeader
        courtName={m.court}
        time={m.timeLabel}
        right={<span className="text-amber-700 font-semibold">🏆 {m.bracket?.name} · {roundDisplayName(m.bracket?.round_names ?? null, m.round_number, m.bracket?.bracket_size ?? 0, m.match_number)}</span>}
      />
      <Teams a={m.team1} b={m.team2} score={m.status === 'completed' && m.score1 !== null ? `${m.score1} – ${m.score2}` : null} />
      <EnteredBy text={m.enteredBy} />
      {/* A scorekeeper can't rewrite a played playoff match (the winner has
          moved on) — the sheet and the board would only refuse it. */}
      {(ctx.canClear || m.status !== 'completed') && m.bracket && m.team1 && m.team2 && (
        <div className="mt-3">
          <AdminScoreEntry
            gameId={m.id}
            leagueId={m.bracket.league_id}
            sport={m.sport ?? undefined}
            homeTeamName={m.team1.name}
            awayTeamName={m.team2.name}
            existingResult={m.status === 'completed' && m.score1 !== null
              ? { homeScore: m.score1, awayScore: m.score2, status: 'confirmed', sets: m.sets?.map((s) => ({ home: s.s1, away: s.s2 })) ?? null }
              : null}
            compact
            large
            canClear={ctx.canClear}
            contextLabel={whereWhen(m.court, m.timeLabel)}
            bracketMatch={{ bracketId: m.bracket.id, team1Id: m.team1.id, team2Id: m.team2.id }}
          />
          <a
            href={`/scoreboard?match=${m.id}`}
            className="press mt-2 flex items-center justify-center min-h-11 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            🔢 Open scoreboard →
          </a>
        </div>
      )}
    </div>
  )
}

function Card({ ctx, item, highlight }: { ctx: CardCtx; item: CourtsideItem; highlight?: boolean }) {
  return item.kind === 'game'
    ? <GameCard ctx={ctx} g={item.row} highlight={highlight} />
    : <BracketCard ctx={ctx} m={item.row} highlight={highlight} />
}

/** Scored games fold to one line; tap to open the full card (to correct it). */
function ScoredRow({ ctx, item, open, onOpen }: { ctx: CardCtx; item: CourtsideItem; open: boolean; onOpen: (id: string) => void }) {
  if (open) return <Card ctx={ctx} item={item} />
  const o = orderOf(item)
  const score = item.kind === 'game'
    ? `${item.row.result?.home_score} – ${item.row.result?.away_score}`
    : item.row.score1 !== null ? `${item.row.score1} – ${item.row.score2}` : 'W'
  return (
    <button
      type="button"
      onClick={() => onOpen(item.row.id)}
      className="press w-full text-left rounded-xl border bg-white px-4 py-3 hover:bg-gray-50 min-h-11"
      aria-label={`${whereWhen(o.court, item.row.timeLabel)}: ${o.teams[0]} ${score} ${o.teams[1]}. Open to change.`}
    >
      <span className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-xs text-gray-500 tabular-nums">{whereWhen(o.court, item.row.timeLabel)}</span>
        <span className="flex-1 min-w-0 truncate font-medium">{o.teams[0]} <span className="font-bold tabular-nums">{score}</span> {o.teams[1]}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
      </span>
      {item.row.enteredBy && <span className="block mt-0.5 text-xs text-gray-500 truncate">{item.row.enteredBy}</span>}
    </button>
  )
}

function Section({ title, tone = 'gray', children }: { title: string; tone?: 'gray' | 'amber' | 'brand'; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mt-6 first:mt-0">
      <h2 className={`text-xs font-semibold uppercase tracking-wide ${tone === 'amber' ? 'text-amber-700' : tone === 'brand' ? 'text-brand-ink' : 'text-gray-500'}`}>{title}</h2>
      {children}
    </section>
  )
}
