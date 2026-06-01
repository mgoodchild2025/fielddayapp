'use client'

import { useState, useMemo, useTransition } from 'react'
import { sendAnnouncement } from '@/actions/messages'
import { UpgradeBadge } from '@/components/ui/upgrade-prompt'

interface League {
  id: string
  name: string
}

interface Team {
  id: string
  name: string
  leagueId: string | null
  leagueName: string | null
}

interface Player {
  userId: string
  name: string
  email: string
}

type Channel = 'email' | 'sms' | 'both'
type AudienceType = 'org' | 'league' | 'team' | 'players'
type MessageClass = 'transactional' | 'commercial'

export function ComposeMessageForm({
  leagues,
  teams = [],
  players = [],
  canSms = false,
}: {
  leagues: League[]
  teams?: Team[]
  players?: Player[]
  canSms?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [audienceType, setAudienceType] = useState<AudienceType>('org')
  const [channel, setChannel] = useState<Channel>('email')
  const [messageClass, setMessageClass] = useState<MessageClass>('transactional')
  const [teamLeagueFilter, setTeamLeagueFilter] = useState('')
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())
  const [playerSearch, setPlayerSearch] = useState('')
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null)

  // Teams shown in the picker, narrowed by the selected league filter
  const filteredTeams = useMemo(() => {
    if (!teamLeagueFilter) return teams
    return teams.filter((t) => t.leagueId === teamLeagueFilter)
  }, [teams, teamLeagueFilter])

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) =>
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    )
  }, [players, playerSearch])

  function togglePlayer(userId: string) {
    setSelectedPlayers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    // Inject the selected player IDs as a JSON-encoded field
    if (audienceType === 'players') {
      fd.set('user_ids', JSON.stringify([...selectedPlayers]))
    }
    setResult(null)

    startTransition(async () => {
      const res = await sendAnnouncement(fd)
      if (res.error) {
        setResult({ error: res.error })
      } else {
        setResult({ success: true })
        ;(e.target as HTMLFormElement).reset()
        setAudienceType('org')
        setChannel('email')
        setMessageClass('transactional')
        setTeamLeagueFilter('')
        setSelectedPlayers(new Set())
        setPlayerSearch('')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Audience */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Send To</label>
          <select
            name="audience_type"
            value={audienceType}
            onChange={(e) => setAudienceType(e.target.value as AudienceType)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="org">All Members</option>
            <option value="league">Specific League</option>
            <option value="team">Specific Team</option>
            <option value="players">Individual Player(s)</option>
          </select>
        </div>
        {audienceType === 'league' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
            <select name="league_id" required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select league…</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        {audienceType === 'team' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by League <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={teamLeagueFilter}
              onChange={(e) => setTeamLeagueFilter(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">All leagues</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Team picker — narrowed by the league filter above */}
      {audienceType === 'team' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
          <select name="team_id" required key={teamLeagueFilter} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">Select team…</option>
            {filteredTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{!teamLeagueFilter && t.leagueName ? ` — ${t.leagueName}` : ''}
              </option>
            ))}
          </select>
          {filteredTeams.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No active teams in this league.</p>
          )}
        </div>
      )}

      {/* Player multi-select */}
      {audienceType === 'players' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Players</label>
            <span className="text-xs text-gray-400">
              {selectedPlayers.size} selected
            </span>
          </div>
          <input
            type="text"
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full border rounded-md px-3 py-2 text-sm mb-2"
          />
          <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
            {filteredPlayers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No players found.</p>
            ) : (
              filteredPlayers.map((p) => (
                <label
                  key={p.userId}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlayers.has(p.userId)}
                    onChange={() => togglePlayer(p.userId)}
                    className="rounded border-gray-300"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 block truncate">{p.name}</span>
                    {p.email && <span className="text-xs text-gray-400 block truncate">{p.email}</span>}
                  </span>
                </label>
              ))
            )}
          </div>
          {selectedPlayers.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPlayers(new Set())}
              className="mt-1.5 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input
          name="title"
          type="text"
          required
          placeholder="e.g. Schedule update for Week 4"
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          name="body"
          required
          rows={5}
          placeholder="Write your announcement here…"
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* Message type (CASL) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Message type</label>
        <input type="hidden" name="message_class" value={messageClass} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMessageClass('transactional')}
            className={`text-left rounded-md border px-3 py-2.5 transition-colors ${
              messageClass === 'transactional'
                ? 'border-transparent ring-2'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
            style={messageClass === 'transactional' ? { boxShadow: '0 0 0 2px var(--brand-primary)' } : {}}
          >
            <span className="block text-sm font-medium text-gray-800">Transactional</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Operational updates — schedules, results, account notices. Sent to all recipients.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMessageClass('commercial')}
            className={`text-left rounded-md border px-3 py-2.5 transition-colors ${
              messageClass === 'commercial'
                ? 'border-transparent ring-2'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
            style={messageClass === 'commercial' ? { boxShadow: '0 0 0 2px var(--brand-primary)' } : {}}
          >
            <span className="block text-sm font-medium text-gray-800">Promotional</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Marketing &amp; offers. Sent only to recipients who opted in, with an unsubscribe link (CASL).
            </span>
          </button>
        </div>
        {messageClass === 'commercial' && (
          <p className="text-xs text-amber-600 mt-1.5">
            Promotional messages are delivered only to members who have opted in to marketing. Recipients
            without consent are automatically skipped.
          </p>
        )}
      </div>

      {/* Delivery channel */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="block text-sm font-medium text-gray-700">Send via</label>
          {!canSms && <UpgradeBadge requiredTier="pro" />}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Email — always available */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer select-none transition-colors ${
              channel === 'email' ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            style={channel === 'email' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            <input type="radio" name="channel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} className="sr-only" />
            ✉️ Email
          </label>

          {/* SMS — gated */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm select-none transition-colors ${
              !canSms
                ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                : channel === 'sms'
                ? 'border-transparent text-white cursor-pointer'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer'
            }`}
            style={canSms && channel === 'sms' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            <input
              type="radio"
              name="channel"
              value="sms"
              checked={channel === 'sms'}
              onChange={() => canSms && setChannel('sms')}
              disabled={!canSms}
              className="sr-only"
            />
            💬 SMS
          </label>

          {/* Both — gated */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm select-none transition-colors ${
              !canSms
                ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                : channel === 'both'
                ? 'border-transparent text-white cursor-pointer'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer'
            }`}
            style={canSms && channel === 'both' ? { backgroundColor: 'var(--brand-primary)' } : {}}
          >
            <input
              type="radio"
              name="channel"
              value="both"
              checked={channel === 'both'}
              onChange={() => canSms && setChannel('both')}
              disabled={!canSms}
              className="sr-only"
            />
            ✉️💬 Both
          </label>
        </div>
        {(channel === 'sms' || channel === 'both') && canSms ? (
          <p className="text-xs text-gray-400 mt-1.5">SMS is sent only to members who have opted in and have a phone number on file.</p>
        ) : null}
        {!canSms && (
          <p className="text-xs text-gray-400 mt-1.5">Upgrade to Pro to send SMS notifications.</p>
        )}
      </div>

      {/* CC options */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" name="cc_self" className="rounded border-gray-300" />
          Also send to myself
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" name="cc_admins" className="rounded border-gray-300" />
          Also send to event admins
        </label>
      </div>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {result?.success && <p className="text-sm text-green-600">Announcement sent successfully!</p>}

      {/* Schedule */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (optional)</label>
        <input
          name="scheduled_for"
          type="datetime-local"
          className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
        <p className="text-xs text-gray-400 mt-1">Leave blank to send immediately.</p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        {isPending ? 'Saving…' : 'Send / Schedule'}
      </button>
    </form>
  )
}
