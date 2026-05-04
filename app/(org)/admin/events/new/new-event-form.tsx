'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createLeague } from '@/actions/events'
import { useRouter } from 'next/navigation'

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

const INPUT =
  'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary'
const SELECT = 'w-full border rounded-md px-3 py-2 text-sm'

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

const EVENT_TYPES = [
  {
    value: 'league',
    label: 'League',
    icon: '🏆',
    desc: 'Season-long team competition with standings',
  },
  {
    value: 'tournament',
    label: 'Tournament',
    icon: '⚡',
    desc: 'Single-day or weekend bracket event',
  },
  {
    value: 'pickup',
    label: 'Pickup',
    icon: '🎯',
    desc: 'Casual open-play session, no roster',
  },
  {
    value: 'drop_in',
    label: 'Drop-in',
    icon: '📅',
    desc: 'Pay-per-session open play',
  },
] as const

type EventTypeValue = (typeof EVENT_TYPES)[number]['value']

const schema = z.object({
  event_type: z.enum(['league', 'tournament', 'pickup', 'drop_in']).default('league'),
  name: z.string().min(2, 'Name required'),
  slug: z
    .string()
    .min(2, 'Slug required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  description: z.string().optional(),
  sport: z.string().default('beach_volleyball'),
  age_group: z.string().optional(),
  price_cents: z.number().min(0).default(0),
  payment_mode: z.enum(['per_player', 'per_team']).default('per_player'),
  max_teams: z.number().optional(),
  max_participants: z.number().optional(),
  min_team_size: z.number().default(4),
  max_team_size: z.number().default(8),
  team_join_policy: z.enum(['open', 'captain_invite', 'admin_only']).default('open'),
  pickup_join_policy: z.enum(['public', 'private']).default('public'),
  registration_mode: z.enum(['session', 'season']).default('season'),
  drop_in_price_cents: z.number().min(0).optional(),
  season_start_date: z.string().optional(),
  season_end_date: z.string().optional(),
  registration_opens_at: z.string().optional(),
  registration_closes_at: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  venue_type: z.enum(['indoor', 'outdoor', 'both']).optional(),
  venue_surface: z.string().optional(),
  waiver_version_id: z.string().uuid().optional().or(z.literal('')),
  schedule_visibility: z.enum(['public', 'participants']).default('public'),
  standings_visibility: z.enum(['public', 'participants']).default('public'),
  bracket_visibility: z.enum(['public', 'participants']).default('public'),
  days_of_week: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional().default([]),
  skill_level: z.enum(['recreational', 'intermediate', 'competitive']).optional(),
  officiated: z.enum(['self_officiated', 'referee']).optional(),
})

type FormData = z.infer<typeof schema>

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
  waivers: Waiver[]
  ruleTemplates: RuleTemplate[]
}

function dateLabels(eventType: EventTypeValue) {
  if (eventType === 'league') return { start: 'Season Start', end: 'Season End' }
  if (eventType === 'tournament') return { start: 'Event Start', end: 'Event End' }
  return { start: 'Session Date', end: 'End Date' }
}

function showTeamConfig(eventType: EventTypeValue) {
  return eventType === 'league' || eventType === 'tournament'
}

// ── Accordion section ─────────────────────────────────────────────────────────
// On mobile: collapses/expands with animation. On md+: always expanded, static header.

function AccordionSection({
  title,
  summary,
  isRequired,
  hasErrors,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  summary: string
  isRequired?: boolean
  hasErrors?: boolean
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`bg-white rounded-lg border overflow-hidden transition-colors ${
        hasErrors ? 'border-red-300' : 'border-gray-200'
      }`}
    >
      {/* Mobile: tappable header */}
      <button
        type="button"
        onClick={onToggle}
        className="md:hidden w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{title}</span>
            {isRequired && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">
                required
              </span>
            )}
            {hasErrors && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            )}
          </div>
          {!isOpen && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-gray-500' : 'text-gray-300'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Desktop: static title */}
      <div className="hidden md:block px-5 pt-5 pb-2">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
      </div>

      {/* Body — animated collapse on mobile, always visible on desktop */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out md:!grid-rows-[1fr] ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-5 pt-1 md:px-5 md:pb-5 md:pt-0 space-y-4 border-t border-gray-100 md:border-t-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function NewEventForm({ waivers, ruleTemplates }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rulesContent, setRulesContent] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [openSection, setOpenSection] = useState<string | null>('basics')
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [selectedOfficiated, setSelectedOfficiated] = useState<string>('')
  const slugEditedRef = useRef(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      event_type: 'league',
      sport: 'beach_volleyball',
      payment_mode: 'per_player',
      team_join_policy: 'open',
      pickup_join_policy: 'public',
      registration_mode: 'season',
      min_team_size: 4,
      max_team_size: 8,
      schedule_visibility: 'public',
      standings_visibility: 'public',
      bracket_visibility: 'public',
    },
  })

  // Watches
  const nameValue = watch('name')
  const eventType = watch('event_type')
  const sport = watch('sport')
  const ageGroup = watch('age_group')
  const priceCents = watch('price_cents')
  const paymentMode = watch('payment_mode')
  const teamJoinPolicy = watch('team_join_policy')
  const pickupJoinPolicy = watch('pickup_join_policy')
  const registrationMode = watch('registration_mode')
  const minTeamSize = watch('min_team_size')
  const maxTeamSize = watch('max_team_size')
  const maxTeams = watch('max_teams')
  const maxParticipants = watch('max_participants')
  const seasonStartDate = watch('season_start_date')
  const seasonEndDate = watch('season_end_date')
  const venueNameWatch = watch('venue_name')
  const waiverVersionId = watch('waiver_version_id')

  useEffect(() => {
    if (!slugEditedRef.current && nameValue) {
      setValue(
        'slug',
        nameValue
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        { shouldValidate: false }
      )
    }
  }, [nameValue, setValue])

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    const result = await createLeague({
      ...(data as Parameters<typeof createLeague>[0]),
      rule_template_id: selectedTemplateId || undefined,
      rules_content: rulesContent || undefined,
      days_of_week: selectedDays.length ? (selectedDays as ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]) : [],
      skill_level: (selectedSkill as 'recreational' | 'intermediate' | 'competitive') || undefined,
      officiated: (selectedOfficiated as 'self_officiated' | 'referee') || undefined,
    })
    if (result.error) {
      setError(
        result.error === 'UPGRADE_REQUIRED'
          ? 'Your plan only allows 1 active event. Upgrade to create more.'
          : result.error
      )
      setLoading(false)
    } else {
      const id = result.data?.id
      // For pickup / drop-in, go straight to Sessions so admin can schedule right away
      const isPickupType = data.event_type === 'pickup' || data.event_type === 'drop_in'
      router.push(isPickupType ? `/admin/events/${id}/sessions` : `/admin/events/${id}`)
    }
  }

  const dates = dateLabels(eventType)
  const withTeams = showTeamConfig(eventType)
  const isPickup = eventType === 'pickup' || eventType === 'drop_in'

  // ── Section summaries ────────────────────────────────────────────────────────

  const sportLabel = SPORTS.find((s) => s.value === sport)?.label ?? sport

  const basicsSummary = [nameValue || null, sportLabel, ageGroup || null]
    .filter(Boolean)
    .join(' · ')

  const pricingSummary = (() => {
    const price = (priceCents ?? 0) > 0 ? `$${((priceCents ?? 0) / 100).toFixed(0)}` : 'Free'
    const mode = withTeams ? (paymentMode === 'per_team' ? '/team' : '/player') : ''
    const joinLabels: Record<string, string> = {
      open: 'Open',
      captain_invite: 'Captain invite',
      admin_only: 'Admin managed',
      public: 'Public',
      private: 'Private',
    }
    const join = withTeams
      ? joinLabels[teamJoinPolicy ?? 'open']
      : joinLabels[pickupJoinPolicy ?? 'public']
    return `${price}${mode} · ${join}`
  })()

  const capacitySummary = withTeams
    ? (() => {
        const sizes = `${minTeamSize ?? 4}–${maxTeamSize ?? 8} players`
        if (paymentMode === 'per_team') return `${sizes} · ${maxTeams ? `${maxTeams} teams max` : 'Unlimited teams'}`
        return `${sizes} · ${maxParticipants ? `${maxParticipants} players max` : 'Unlimited players'}`
      })()
    : maxParticipants
    ? `${maxParticipants} players max`
    : 'Unlimited'

  const datesSummary = (() => {
    if (!seasonStartDate) return 'Not set'
    const fmt = (d: string) =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    return fmt(seasonStartDate) + (seasonEndDate ? ` – ${fmt(seasonEndDate)}` : '')
  })()

  const venueSummary = venueNameWatch || 'Not set'

  const detailsSummary = [
    selectedDays.length
      ? selectedDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
      : null,
    selectedSkill || null,
    selectedOfficiated ? selectedOfficiated.replace('_', '-') : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Optional'

  const waiverSummary = (() => {
    const parts: string[] = []
    if (waiverVersionId) {
      const w = waivers.find((w) => w.id === waiverVersionId)
      if (w) parts.push(`${w.title} v${w.version}`)
    }
    if (rulesContent) parts.push('Rules added')
    return parts.length ? parts.join(' · ') : 'None'
  })()

  // ── Per-section error flags ───────────────────────────────────────────────────

  const basicsHasErrors = !!(
    errors.name ||
    errors.slug ||
    errors.sport ||
    errors.description ||
    errors.age_group
  )
  const pricingHasErrors = !!(
    errors.price_cents ||
    errors.payment_mode ||
    errors.drop_in_price_cents
  )
  const capacityHasErrors = !!(
    errors.min_team_size ||
    errors.max_team_size ||
    errors.max_teams ||
    errors.max_participants
  )
  const datesHasErrors = !!(
    errors.season_start_date ||
    errors.season_end_date ||
    errors.registration_opens_at ||
    errors.registration_closes_at
  )
  const venueHasErrors = !!(
    errors.venue_name ||
    errors.venue_address ||
    errors.venue_type ||
    errors.venue_surface
  )
  const waiverHasErrors = !!errors.waiver_version_id

  function toggle(id: string) {
    setOpenSection((prev) => (prev === id ? null : id))
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Event</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 md:space-y-5">

        {/* ── Event type picker — always visible ── */}
        <div className="bg-white rounded-lg border p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Event Type</p>
          <div className="grid grid-cols-2 gap-3">
            {EVENT_TYPES.map((et) => {
              const active = eventType === et.value
              return (
                <button
                  key={et.value}
                  type="button"
                  onClick={() => setValue('event_type', et.value, { shouldValidate: false })}
                  className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                    active
                      ? 'border-brand-primary bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={
                    active
                      ? {
                          borderColor: 'var(--brand-primary)',
                          backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, white)',
                        }
                      : {}
                  }
                >
                  <span className="text-xl">{et.icon}</span>
                  <p className="font-semibold text-sm mt-1">{et.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{et.desc}</p>
                </button>
              )
            })}
          </div>
          <input type="hidden" {...register('event_type')} />
        </div>

        {/* ── 1. Basics ── */}
        <AccordionSection
          title="Basics"
          summary={basicsSummary}
          isRequired
          hasErrors={basicsHasErrors}
          isOpen={openSection === 'basics'}
          onToggle={() => toggle('basics')}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Event Name" error={errors.name?.message}>
              <input {...register('name')} type="text" className={INPUT} autoComplete="off" />
            </Field>
            <Field label="URL Slug" error={errors.slug?.message}>
              <input
                {...register('slug')}
                type="text"
                className={INPUT}
                onChange={(e) => {
                  slugEditedRef.current = true
                  register('slug').onChange(e)
                }}
              />
            </Field>
          </div>

          <Field label="Description" error={errors.description?.message}>
            <textarea {...register('description')} rows={3} className={INPUT} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Sport" error={errors.sport?.message}>
              <select {...register('sport')} className={SELECT}>
                {SPORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Age Group" error={errors.age_group?.message}>
              <select {...register('age_group')} className={SELECT}>
                <option value="">All ages</option>
                <option value="Youth (U18)">Youth (U18)</option>
                <option value="Adult 18+">Adult 18+</option>
                <option value="Adult 19+">Adult 19+</option>
                <option value="Adult 25+">Adult 25+</option>
                <option value="Adult 35+">Adult 35+</option>
                <option value="Seniors 55+">Seniors 55+</option>
              </select>
            </Field>
          </div>
        </AccordionSection>

        {/* ── 2. Registration & Pricing ── */}
        {(withTeams || isPickup) && (
          <AccordionSection
            title="Registration & Pricing"
            summary={pricingSummary}
            hasErrors={pricingHasErrors}
            isOpen={openSection === 'pricing'}
            onToggle={() => toggle('pricing')}
          >
            {withTeams && (
              <Field label="Team Join Policy" error={errors.team_join_policy?.message}>
                <select {...register('team_join_policy')} className={SELECT}>
                  <option value="open">Open (anyone can join)</option>
                  <option value="captain_invite">Captain invite only</option>
                  <option value="admin_only">Admin managed</option>
                </select>
              </Field>
            )}

            {!withTeams && (
              <>
                <Field label="Access" error={errors.pickup_join_policy?.message}>
                  <select {...register('pickup_join_policy')} className={SELECT}>
                    <option value="public">Public — anyone can register</option>
                    <option value="private">Private — admin invite only</option>
                  </select>
                </Field>
                {eventType === 'drop_in' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Registration Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'session', label: 'Per session', desc: 'Players join individual sessions' },
                        { value: 'season', label: 'Season pass', desc: 'Register once, attend all sessions' },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex flex-col gap-0.5 p-3 rounded-md border cursor-pointer transition-colors ${
                            registrationMode === opt.value
                              ? 'border-[var(--brand-primary)] bg-orange-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            {...register('registration_mode')}
                            value={opt.value}
                            className="sr-only"
                          />
                          <span className="text-sm font-semibold">{opt.label}</span>
                          <span className="text-xs text-gray-500">{opt.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {eventType === 'pickup' && (
                  <input type="hidden" {...register('registration_mode')} value="season" />
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field
                label={isPickup ? 'Season fee (0 = free)' : 'Price (0 = free)'}
                error={errors.price_cents?.message}
              >
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                    $
                  </span>
                  <input
                    {...register('price_cents', {
                      setValueAs: (v) => Math.round(Number(v || 0) * 100),
                    })}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    defaultValue={0}
                    className={INPUT}
                    style={{ paddingLeft: '1.75rem' }}
                  />
                </div>
              </Field>
              {isPickup ? (
                <Field
                  label="Drop-in fee (blank = no drop-ins)"
                  error={errors.drop_in_price_cents?.message}
                >
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      $
                    </span>
                    <input
                      {...register('drop_in_price_cents', {
                        setValueAs: (v) =>
                          v === '' || v == null ? undefined : Math.round(Number(v) * 100),
                      })}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Leave blank"
                      className={INPUT}
                      style={{ paddingLeft: '1.75rem' }}
                    />
                  </div>
                </Field>
              ) : (
                <Field label="Payment Mode" error={errors.payment_mode?.message}>
                  <select {...register('payment_mode')} className={SELECT}>
                    <option value="per_player">Per Player</option>
                    {withTeams && <option value="per_team">Per Team</option>}
                  </select>
                </Field>
              )}
            </div>
          </AccordionSection>
        )}

        {/* ── 3. Capacity ── */}
        <AccordionSection
          title="Capacity"
          summary={capacitySummary}
          hasErrors={capacityHasErrors}
          isOpen={openSection === 'capacity'}
          onToggle={() => toggle('capacity')}
        >
          {withTeams ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Min Team Size" error={errors.min_team_size?.message}>
                  <input
                    {...register('min_team_size', {
                      setValueAs: (v) => (v === '' || v == null ? 4 : Number(v)),
                    })}
                    type="number"
                    min={1}
                    className={INPUT}
                  />
                </Field>
                <Field label="Max Team Size" error={errors.max_team_size?.message}>
                  <input
                    {...register('max_team_size', {
                      setValueAs: (v) => (v === '' || v == null ? 8 : Number(v)),
                    })}
                    type="number"
                    min={1}
                    className={INPUT}
                  />
                </Field>
                {paymentMode === 'per_team' ? (
                  <Field label="Max Teams" error={errors.max_teams?.message}>
                    <input
                      {...register('max_teams', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                      type="number"
                      min={1}
                      placeholder="Unlimited"
                      className={INPUT}
                    />
                  </Field>
                ) : (
                  <Field label="Max Players" error={errors.max_participants?.message}>
                    <input
                      {...register('max_participants', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                      type="number"
                      min={1}
                      placeholder="Unlimited"
                      className={INPUT}
                    />
                  </Field>
                )}
              </div>

              {/* Tab visibility — tucked here since it's rarely changed */}
              <div className="pt-1 border-t border-gray-100 space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Tab Visibility</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Who can see each tab on the public event page.
                  </p>
                </div>
                {[
                  { field: 'schedule_visibility' as const, label: 'Schedule' },
                  { field: 'standings_visibility' as const, label: 'Standings' },
                  { field: 'bracket_visibility' as const, label: 'Bracket' },
                ].map(({ field, label }) => (
                  <div key={field} className="flex items-center gap-4">
                    <span className="text-sm text-gray-700 w-20 shrink-0">{label}</span>
                    <select {...register(field)} className={`${SELECT} flex-1`}>
                      <option value="public">Public</option>
                      <option value="participants">Participants only</option>
                    </select>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Field label="Max Participants" error={errors.max_participants?.message}>
              <input
                {...register('max_participants', {
                  setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                })}
                type="number"
                min={1}
                placeholder="Unlimited"
                className={INPUT}
              />
            </Field>
          )}
        </AccordionSection>

        {/* ── 4. Dates ── */}
        <AccordionSection
          title="Dates"
          summary={datesSummary}
          hasErrors={datesHasErrors}
          isOpen={openSection === 'dates'}
          onToggle={() => toggle('dates')}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label={dates.start} error={errors.season_start_date?.message}>
              <input {...register('season_start_date')} type="date" className={INPUT} />
            </Field>
            <Field label={dates.end} error={errors.season_end_date?.message}>
              <input {...register('season_end_date')} type="date" className={INPUT} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Registration Opens" error={errors.registration_opens_at?.message}>
              <input
                {...register('registration_opens_at')}
                type="datetime-local"
                className={INPUT}
              />
            </Field>
            <Field label="Registration Closes" error={errors.registration_closes_at?.message}>
              <input
                {...register('registration_closes_at')}
                type="datetime-local"
                className={INPUT}
              />
            </Field>
          </div>
        </AccordionSection>

        {/* ── 5. Venue ── */}
        <AccordionSection
          title="Venue"
          summary={venueSummary}
          hasErrors={venueHasErrors}
          isOpen={openSection === 'venue'}
          onToggle={() => toggle('venue')}
        >
          <Field label="Venue Name" error={errors.venue_name?.message}>
            <input
              {...register('venue_name')}
              type="text"
              placeholder="e.g. Ashbridges Bay"
              className={INPUT}
            />
          </Field>
          <Field label="Address" error={errors.venue_address?.message}>
            <input
              {...register('venue_address')}
              type="text"
              placeholder="123 Main St, Toronto, ON"
              className={INPUT}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Surface" error={errors.venue_surface?.message}>
              <input
                {...register('venue_surface')}
                type="text"
                placeholder="e.g. Sand, Hardwood, Grass"
                className={INPUT}
              />
            </Field>
            <Field label="Indoor / Outdoor" error={errors.venue_type?.message}>
              <select {...register('venue_type')} className={SELECT}>
                <option value="">Select…</option>
                <option value="outdoor">Outdoor</option>
                <option value="indoor">Indoor</option>
                <option value="both">Both</option>
              </select>
            </Field>
          </div>
        </AccordionSection>

        {/* ── 6. Details ── */}
        <AccordionSection
          title="Details"
          summary={detailsSummary}
          isOpen={openSection === 'details'}
          onToggle={() => toggle('details')}
        >
          {/* Days of week */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
            <div className="flex flex-wrap gap-2">
              {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => {
                const label = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }[day]
                const active = selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setSelectedDays((prev) =>
                        active ? prev.filter((d) => d !== day) : [...prev, day]
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      active ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    style={active ? { backgroundColor: 'var(--brand-primary)' } : {}}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Skill level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Skill Level</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'recreational', label: 'Recreational' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'competitive', label: 'Competitive' },
              ] as const).map((opt) => {
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
          </div>

          {/* Officiated */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Officiated</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'self_officiated', label: 'Self-officiated' },
                { value: 'referee', label: 'Referee' },
              ] as const).map((opt) => {
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
          </div>
        </AccordionSection>

        {/* ── 7. Waiver & Rules ── */}
        <AccordionSection
          title="Waiver & Rules"
          summary={waiverSummary}
          hasErrors={waiverHasErrors}
          isOpen={openSection === 'waiver'}
          onToggle={() => toggle('waiver')}
        >
          <Field label="Waiver" error={errors.waiver_version_id?.message}>
            <select {...register('waiver_version_id')} className={SELECT}>
              <option value="">No waiver required</option>
              {waivers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title} (v{w.version})
                </option>
              ))}
            </select>
            {waivers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No waivers set up yet.{' '}
                <a href="/admin/settings/waivers" className="underline">
                  Create one in Settings → Waivers
                </a>{' '}
                first.
              </p>
            )}
          </Field>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rules Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value)
                const tpl = ruleTemplates.find((t) => t.id === e.target.value)
                if (tpl) setRulesContent(tpl.content)
              }}
              className={SELECT}
            >
              <option value="">No template / custom</option>
              {ruleTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {ruleTemplates.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No rule templates yet.{' '}
                <a href="/admin/settings/event-rules" className="underline">
                  Create one in Settings → Event Rules
                </a>
                .
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rules Content
            </label>
            <textarea
              value={rulesContent}
              onChange={(e) => setRulesContent(e.target.value)}
              rows={10}
              placeholder="Event rules shown to players on the event page…"
              className={`${INPUT} font-mono text-xs leading-relaxed resize-y`}
            />
            {rulesContent && selectedTemplateId && (
              <p className="text-xs text-gray-400 mt-1">
                Editing here only affects this event — the template is not modified.
              </p>
            )}
          </div>
        </AccordionSection>

        {/* ── Submit ── */}
        <div className="flex gap-3 pt-2 pb-8 md:pb-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Creating…' : 'Create Event'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 rounded-md font-semibold border text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
