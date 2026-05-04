'use client'

import { useState } from 'react'
import { updateLeague } from '@/actions/events'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

interface League {
  id: string
  name: string
  slug: string
  description: string | null
  sport: string | null
  event_type: string
  registration_mode: string
  price_cents: number
  drop_in_price_cents: number | null
  currency: string
  payment_mode: string
  min_team_size: number | null
  max_team_size: number | null
  max_teams: number | null
  max_participants: number | null
  season_start_date: string | null
  season_end_date: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  waiver_version_id: string | null
  rule_template_id: string | null
  rules_content: string | null
  age_group: string | null
  venue_name: string | null
  venue_address: string | null
  venue_type: 'indoor' | 'outdoor' | 'both' | null
  venue_surface: string | null
  organizer_name: string | null
  organizer_email: string | null
  organizer_phone: string | null
  team_join_policy: string
  schedule_visibility: string
  standings_visibility: string
  bracket_visibility: string
  days_of_week: string[] | null
  skill_level: string | null
  officiated: string | null
}

interface Waiver {
  id: string
  title: string
  version: number
}

interface RuleTemplate {
  id: string
  title: string
  content: string
}

interface Props {
  league: League
  waivers: Waiver[]
  ruleTemplates: RuleTemplate[]
}

const SPORTS = [
  { value: 'baseball', label: 'Baseball' },
  { value: 'beach_volleyball', label: 'Beach Volleyball' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'dodgeball', label: 'Dodgeball' },
  { value: 'flag_football', label: 'Flag Football' },
  { value: 'hockey', label: 'Hockey' },
  { value: 'kickball', label: 'Kickball' },
  { value: 'pickleball', label: 'Pickleball' },
  { value: 'soccer', label: 'Soccer' },
  { value: 'softball', label: 'Softball' },
  { value: 'tennis', label: 'Tennis' },
  { value: 'ultimate_frisbee', label: 'Ultimate Frisbee' },
  { value: 'volleyball', label: 'Volleyball' },
  { value: 'other', label: 'Other' },
]

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

function toDateTimeInput(iso: string | null) {
  return iso ? iso.slice(0, 16) : ''
}

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
] as const

const SKILL_LEVELS = [
  { value: 'recreational', label: 'Recreational' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'competitive', label: 'Competitive' },
] as const

const OFFICIATED_OPTIONS = [
  { value: 'self_officiated', label: 'Self-officiated' },
  { value: 'referee', label: 'Referee' },
] as const

export function EditEventForm({ league, waivers, ruleTemplates }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [rulesContent, setRulesContent] = useState(league.rules_content ?? '')
  const [selectedDays, setSelectedDays] = useState<string[]>(league.days_of_week ?? [])
  const [selectedSkill, setSelectedSkill] = useState<string>(league.skill_level ?? '')
  const [selectedOfficiated, setSelectedOfficiated] = useState<string>(league.officiated ?? '')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const fd = new FormData(e.currentTarget)
    const waiverVal = fd.get('waiver_version_id') as string
    const ruleTemplateVal = fd.get('rule_template_id') as string

    const result = await updateLeague(league.id, {
      name: fd.get('name') as string,
      description: (fd.get('description') as string) || undefined,
      sport: fd.get('sport') as string,

      price_cents: Math.round(Number(fd.get('price_cents') || 0) * 100),
      payment_mode: (fd.get('payment_mode') as 'per_player' | 'per_team') || 'per_player',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      drop_in_price_cents: fd.get('drop_in_price_cents') ? Math.round(Number(fd.get('drop_in_price_cents')) * 100) : null as any,
      min_team_size: Number(fd.get('min_team_size')),
      max_team_size: Number(fd.get('max_team_size')),
      max_teams: fd.get('max_teams') ? Number(fd.get('max_teams')) : undefined,
      max_participants: fd.get('max_participants') ? Number(fd.get('max_participants')) : undefined,
      season_start_date: (fd.get('season_start_date') as string) || undefined,
      season_end_date: (fd.get('season_end_date') as string) || undefined,
      registration_opens_at: (fd.get('registration_opens_at') as string) || undefined,
      registration_closes_at: (fd.get('registration_closes_at') as string) || undefined,
      waiver_version_id: waiverVal || undefined,
      rule_template_id: ruleTemplateVal || undefined,
      rules_content: rulesContent || undefined,
      age_group: (fd.get('age_group') as string) || undefined,
      venue_name: (fd.get('venue_name') as string) || undefined,
      venue_address: (fd.get('venue_address') as string) || undefined,
      venue_type: (fd.get('venue_type') as 'indoor' | 'outdoor' | 'both') || undefined,
      venue_surface: (fd.get('venue_surface') as string) || undefined,
      organizer_name: (fd.get('organizer_name') as string) || undefined,
      organizer_email: (fd.get('organizer_email') as string) || undefined,
      organizer_phone: (fd.get('organizer_phone') as string) || undefined,
      team_join_policy: (fd.get('team_join_policy') as 'open' | 'captain_invite' | 'admin_only') || 'open',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registration_mode: (fd.get('registration_mode') as string) || 'session',
      schedule_visibility: (fd.get('schedule_visibility') as 'public' | 'participants') || 'public',
      standings_visibility: (fd.get('standings_visibility') as 'public' | 'participants') || 'public',
      bracket_visibility: (fd.get('bracket_visibility') as 'public' | 'participants') || 'public',
      days_of_week: selectedDays.length ? selectedDays : undefined,
      skill_level: (selectedSkill as 'recreational' | 'intermediate' | 'competitive') || undefined,
      officiated: (selectedOfficiated as 'self_officiated' | 'referee') || undefined,
    } as any)

    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setOpen(false)
    }
  }

  if (!open) {
    const activeWaiver = waivers.find((w) => w.id === league.waiver_version_id)
    const activeTemplate = ruleTemplates.find((t) => t.id === league.rule_template_id)
    return (
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">League Details</h2>
          {activeWaiver && (
            <p className="text-xs text-gray-400 mt-0.5">Waiver: {activeWaiver.title}</p>
          )}
          {(activeTemplate || league.rules_content) && (
            <p className="text-xs text-gray-400 mt-0.5">
              Rules: {activeTemplate ? activeTemplate.title : 'Custom'}
            </p>
          )}
        </div>
        <button
          onClick={() => { setOpen(true); setSuccess(false) }}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Edit Event Details</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input name="name" defaultValue={league.name} required className="input" />
        </Field>

        <Field label="Description">
          <textarea name="description" defaultValue={league.description ?? ''} rows={3} className="input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sport">
            <select name="sport" defaultValue={league.sport ?? 'beach_volleyball'} className="input">
              {SPORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {league.event_type === 'drop_in' && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Registration Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'session', label: 'Per session', desc: 'Players join individual sessions' },
                { value: 'season', label: 'Season pass', desc: 'Register once, attend all sessions' },
              ].map((opt) => (
                <label key={opt.value} className={`flex flex-col gap-0.5 p-3 rounded-md border cursor-pointer transition-colors ${league.registration_mode === opt.value ? 'border-blue-500 bg-white' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input type="radio" name="registration_mode" value={opt.value} defaultChecked={league.registration_mode === opt.value} className="sr-only" />
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.desc}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {league.event_type === 'pickup' && (
          <input type="hidden" name="registration_mode" value="season" />
        )}

        {(league.event_type === 'pickup' || league.event_type === 'drop_in') ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Season fee">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                <input name="price_cents" type="number" min="0" step="0.01" placeholder="0.00"
                  defaultValue={(league.price_cents / 100).toFixed(2)} className="input" style={{ paddingLeft: '1.75rem' }} />
              </div>
            </Field>
            <Field label="Drop-in fee (blank = none)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                <input name="drop_in_price_cents" type="number" min="0" step="0.01"
                  defaultValue={league.drop_in_price_cents != null ? (league.drop_in_price_cents / 100).toFixed(2) : ''}
                  placeholder="Leave blank" className="input" style={{ paddingLeft: '1.75rem' }} />
              </div>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                <input name="price_cents" type="number" min="0" step="0.01" placeholder="0.00"
                  defaultValue={(league.price_cents / 100).toFixed(2)} className="input" style={{ paddingLeft: '1.75rem' }} />
              </div>
            </Field>
            <Field label="Payment Mode">
              <select name="payment_mode" defaultValue={league.payment_mode} className="input">
                <option value="per_player">Per Player</option>
                <option value="per_team">Per Team</option>
              </select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Age Group">
            <select name="age_group" defaultValue={league.age_group ?? ''} className="input">
              <option value="">All ages</option>
              <option value="Youth (U18)">Youth (U18)</option>
              <option value="Adult 18+">Adult 18+</option>
              <option value="Adult 19+">Adult 19+</option>
              <option value="Adult 25+">Adult 25+</option>
              <option value="Adult 35+">Adult 35+</option>
              <option value="Seniors 55+">Seniors 55+</option>
            </select>
          </Field>
          <Field label="Team Join Policy">
            <select name="team_join_policy" defaultValue={league.team_join_policy ?? 'open'} className="input">
              <option value="open">Open (anyone can join)</option>
              <option value="captain_invite">Captain invite only</option>
              <option value="admin_only">Admin managed</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Min Team Size">
            <input name="min_team_size" type="number" min="1" defaultValue={league.min_team_size ?? 1} className="input" />
          </Field>
          <Field label="Max Team Size">
            <input name="max_team_size" type="number" min="1" defaultValue={league.max_team_size ?? 8} className="input" />
          </Field>
          {league.payment_mode === 'per_team' ? (
            <Field label="Max Teams">
              <input name="max_teams" type="number" min="1" defaultValue={league.max_teams ?? ''} placeholder="Unlimited" className="input" />
            </Field>
          ) : (
            <Field label="Max Players">
              <input name="max_participants" type="number" min="1" defaultValue={league.max_participants ?? ''} placeholder="Unlimited" className="input" />
            </Field>
          )}
          {/* Keep the hidden field for the mode that isn't shown so the submit handler always has both values */}
          {league.payment_mode === 'per_team'
            ? <input type="hidden" name="max_participants" value={league.max_participants ?? ''} />
            : <input type="hidden" name="max_teams" value={league.max_teams ?? ''} />}
        </div>

        {/* Event Details */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Event Details</p>
          <div className="space-y-4">

            {/* Days of week */}
            <Field label="Days of Week">
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map((day) => {
                  const active = selectedDays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        setSelectedDays((prev) =>
                          active ? prev.filter((d) => d !== day.value) : [...prev, day.value]
                        )
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        active ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* Skill level */}
            <Field label="Skill Level">
              <div className="flex flex-wrap gap-2 mt-1">
                {SKILL_LEVELS.map((opt) => {
                  const active = selectedSkill === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedSkill(active ? '' : opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        active ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* Officiated */}
            <Field label="Officiated">
              <div className="flex flex-wrap gap-2 mt-1">
                {OFFICIATED_OPTIONS.map((opt) => {
                  const active = selectedOfficiated === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedOfficiated(active ? '' : opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        active ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </Field>

          </div>
        </div>

        {/* Venue */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Venue</p>
          <div className="space-y-3">
            <Field label="Venue Name">
              <input name="venue_name" type="text" defaultValue={league.venue_name ?? ''} placeholder="e.g. Ashbridges Bay" className="input" />
            </Field>
            <Field label="Address">
              <input name="venue_address" type="text" defaultValue={league.venue_address ?? ''} placeholder="123 Main St, Toronto, ON" className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Surface">
                <input name="venue_surface" type="text" defaultValue={league.venue_surface ?? ''} placeholder="Sand, Hardwood…" className="input" />
              </Field>
              <Field label="Type">
                <select name="venue_type" defaultValue={league.venue_type ?? ''} className="input">
                  <option value="">Select…</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="both">Both</option>
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Season Start">
            <input name="season_start_date" type="date" defaultValue={toDateInput(league.season_start_date)} className="input" />
          </Field>
          <Field label="Season End">
            <input name="season_end_date" type="date" defaultValue={toDateInput(league.season_end_date)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reg Opens">
            <input name="registration_opens_at" type="datetime-local" defaultValue={toDateTimeInput(league.registration_opens_at)} className="input" />
          </Field>
          <Field label="Reg Closes">
            <input name="registration_closes_at" type="datetime-local" defaultValue={toDateTimeInput(league.registration_closes_at)} className="input" />
          </Field>
        </div>

        <Field label="Waiver">
          <select name="waiver_version_id" defaultValue={league.waiver_version_id ?? ''} className="input">
            <option value="">No waiver required</option>
            {waivers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} (v{w.version})
              </option>
            ))}
          </select>
          {waivers.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No waivers set up.{' '}
              <a href="/admin/settings/waivers" className="underline">Create one in Settings → Waivers</a>.
            </p>
          )}
        </Field>

        {/* Tab visibility */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tab Visibility</p>
          <p className="text-xs text-gray-400 mb-3">Control who can see each tab on the public event page.</p>
          <div className="space-y-2">
            {[
              { name: 'schedule_visibility', label: 'Schedule', default: league.schedule_visibility ?? 'public' },
              { name: 'standings_visibility', label: 'Standings', default: league.standings_visibility ?? 'public' },
              { name: 'bracket_visibility', label: 'Bracket', default: league.bracket_visibility ?? 'public' },
            ].map((tab) => (
              <div key={tab.name} className="flex items-center justify-between gap-4">
                <label className="text-sm text-gray-700 w-20 shrink-0">{tab.label}</label>
                <select name={tab.name} defaultValue={tab.default} className="input flex-1">
                  <option value="public">Public</option>
                  <option value="participants">Participants only</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Event Rules</label>
          <select
            name="rule_template_id"
            defaultValue={league.rule_template_id ?? ''}
            className="input mb-2"
            onChange={(e) => {
              const tpl = ruleTemplates.find((t) => t.id === e.target.value)
              if (tpl) setRulesContent(tpl.content)
            }}
          >
            <option value="">No template / custom</option>
            {ruleTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          {/* Hidden input keeps rulesContent in FormData without relying on the editor */}
          <input type="hidden" name="rules_content" value={rulesContent} />
          <RichTextEditor
            content={rulesContent}
            onChange={setRulesContent}
            minHeight="200px"
          />
          {ruleTemplates.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No rule templates set up.{' '}
              <a href="/admin/settings/event-rules" className="underline">Create one in Settings → Event Rules</a>.
            </p>
          )}
          {rulesContent && (
            <p className="text-xs text-gray-400 mt-1">
              Editing the content here only affects this event — the template is not modified.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
