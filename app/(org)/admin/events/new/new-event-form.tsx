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
  league_type: z.enum(['team', 'individual', 'dropin', 'tournament']),
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
  season_start_date: z.string().optional(),
  season_end_date: z.string().optional(),
  registration_opens_at: z.string().optional(),
  registration_closes_at: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  venue_type: z.enum(['indoor', 'outdoor', 'both']).optional(),
  venue_surface: z.string().optional(),
  organizer_name: z.string().optional(),
  organizer_email: z.string().optional(),
  organizer_phone: z.string().optional(),
  waiver_version_id: z.string().uuid().optional().or(z.literal('')),
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

export function NewEventForm({ waivers, ruleTemplates }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rulesContent, setRulesContent] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
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
      league_type: 'team',
      sport: 'beach_volleyball',
      payment_mode: 'per_player',
      team_join_policy: 'open',
      pickup_join_policy: 'public',
      min_team_size: 4,
      max_team_size: 8,
    },
  })

  const nameValue = watch('name')
  const eventType = watch('event_type')

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
    })
    if (result.error) {
      setError(
        result.error === 'UPGRADE_REQUIRED'
          ? 'Your plan only allows 1 active event. Upgrade to create more.'
          : result.error
      )
      setLoading(false)
    } else {
      router.push(`/admin/events/${result.data?.id}`)
    }
  }

  const dates = dateLabels(eventType)
  const withTeams = showTeamConfig(eventType)

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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* ── Event type picker ── */}
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
                  style={active ? { borderColor: 'var(--brand-primary)', backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, white)' } : {}}
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

        {/* ── Basic info ── */}
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Details</p>
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
              <input {...register('sport')} type="text" className={INPUT} />
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

          {withTeams && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Registration Format" error={errors.league_type?.message}>
                <select {...register('league_type')} className={SELECT}>
                  <option value="team">Team</option>
                  <option value="individual">Individual</option>
                  <option value="dropin">Drop-in</option>
                  <option value="tournament">Tournament</option>
                </select>
              </Field>
              <Field label="Team Join Policy" error={errors.team_join_policy?.message}>
                <select {...register('team_join_policy')} className={SELECT}>
                  <option value="open">Open (anyone can join)</option>
                  <option value="captain_invite">Captain invite only</option>
                  <option value="admin_only">Admin managed</option>
                </select>
              </Field>
            </div>
          )}

          {!withTeams && (
            <Field label="Session Access" error={errors.pickup_join_policy?.message}>
              <select {...register('pickup_join_policy')} className={SELECT}>
                <option value="public">Public — anyone can join sessions</option>
                <option value="private">Private — admin invite only</option>
              </select>
            </Field>
          )}
        </div>

        {/* ── Pricing ── */}
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Pricing</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (0 = free)" error={errors.price_cents?.message}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  {...register('price_cents', {
                    setValueAs: (v) => Math.round(Number(v || 0) * 100),
                  })}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  defaultValue={0}
                  className={`${INPUT} pl-7`}
                />
              </div>
            </Field>
            <Field label="Payment Mode" error={errors.payment_mode?.message}>
              <select {...register('payment_mode')} className={SELECT}>
                <option value="per_player">Per Player</option>
                {withTeams && <option value="per_team">Per Team</option>}
              </select>
            </Field>
          </div>
        </div>

        {/* ── Team size & capacity (team-based events only) ── */}
        {withTeams && (
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Teams &amp; Capacity</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Min Team Size" error={errors.min_team_size?.message}>
                <input
                  {...register('min_team_size', { valueAsNumber: true })}
                  type="number"
                  min={1}
                  className={INPUT}
                />
              </Field>
              <Field label="Max Team Size" error={errors.max_team_size?.message}>
                <input
                  {...register('max_team_size', { valueAsNumber: true })}
                  type="number"
                  min={1}
                  className={INPUT}
                />
              </Field>
              <Field label="Max Teams" error={errors.max_teams?.message}>
                <input
                  {...register('max_teams', { valueAsNumber: true })}
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  className={INPUT}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── Capacity (non-team events) ── */}
        {!withTeams && (
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Capacity</p>
            <Field label="Max Participants" error={errors.max_participants?.message}>
              <input
                {...register('max_participants', { valueAsNumber: true })}
                type="number"
                min={1}
                placeholder="Unlimited"
                className={INPUT}
              />
            </Field>
          </div>
        )}

        {/* ── Dates ── */}
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Dates</p>
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
              <input {...register('registration_opens_at')} type="datetime-local" className={INPUT} />
            </Field>
            <Field label="Registration Closes" error={errors.registration_closes_at?.message}>
              <input {...register('registration_closes_at')} type="datetime-local" className={INPUT} />
            </Field>
          </div>
        </div>

        {/* ── Venue ── */}
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Venue / Location</p>
          <Field label="Venue Name" error={errors.venue_name?.message}>
            <input {...register('venue_name')} type="text" placeholder="e.g. Ashbridges Bay" className={INPUT} />
          </Field>
          <Field label="Address" error={errors.venue_address?.message}>
            <input {...register('venue_address')} type="text" placeholder="123 Main St, Toronto, ON" className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Surface" error={errors.venue_surface?.message}>
              <input {...register('venue_surface')} type="text" placeholder="e.g. Sand, Hardwood, Grass" className={INPUT} />
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
        </div>

        {/* ── Organizer contact ── */}
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Organizer Contact</p>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Name" error={errors.organizer_name?.message}>
              <input {...register('organizer_name')} type="text" className={INPUT} />
            </Field>
            <Field label="Email" error={errors.organizer_email?.message}>
              <input {...register('organizer_email')} type="email" className={INPUT} />
            </Field>
            <Field label="Phone" error={errors.organizer_phone?.message}>
              <input {...register('organizer_phone')} type="tel" className={INPUT} />
            </Field>
          </div>
        </div>

        {/* ── Waiver ── */}
        <div className="bg-white rounded-lg border p-5">
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
        </div>

        {/* ── Event Rules ── */}
        <div className="bg-white rounded-lg border p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Event Rules</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
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
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            {ruleTemplates.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No rule templates set up yet.{' '}
                <a href="/admin/settings/event-rules" className="underline">
                  Create one in Settings → Event Rules
                </a>.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rules Content</label>
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
        </div>

        <div className="flex gap-3 pt-2">
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
