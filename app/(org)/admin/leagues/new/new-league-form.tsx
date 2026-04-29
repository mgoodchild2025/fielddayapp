'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createLeague } from '@/actions/leagues'
import { useRouter } from 'next/navigation'

// ── Field component defined outside so it never gets remounted on re-render ──
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

const schema = z.object({
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

export function NewLeagueForm({ waivers, ruleTemplates }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rulesContent, setRulesContent] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  // Track whether slug was manually edited so we stop auto-generating it
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
      league_type: 'team',
      sport: 'beach_volleyball',
      payment_mode: 'per_player',
      team_join_policy: 'open',
      min_team_size: 4,
      max_team_size: 8,
      price_cents: 0,
    },
  })

  const nameValue = watch('name')

  // Auto-generate slug from name (without calling setValue in onChange, avoiding remounts)
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
          ? 'Your plan only allows 1 active league. Upgrade to create more.'
          : result.error
      )
      setLoading(false)
    } else {
      router.push(`/admin/leagues/${result.data?.id}`)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create League</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border p-6 space-y-5">
        {/* ── Basic info ── */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="League Name" error={errors.name?.message}>
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
          <Field label="League Type" error={errors.league_type?.message}>
            <select {...register('league_type')} className={SELECT}>
              <option value="team">Team</option>
              <option value="individual">Individual</option>
              <option value="dropin">Drop-in</option>
              <option value="tournament">Tournament</option>
            </select>
          </Field>
          <Field label="Sport" error={errors.sport?.message}>
            <input {...register('sport')} type="text" className={INPUT} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
          <Field label="Team Join Policy" error={errors.team_join_policy?.message}>
            <select {...register('team_join_policy')} className={SELECT}>
              <option value="open">Open (anyone can join)</option>
              <option value="captain_invite">Captain invite only</option>
              <option value="admin_only">Admin managed</option>
            </select>
          </Field>
        </div>

        {/* ── Pricing ── */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (cents, 0 = free)" error={errors.price_cents?.message}>
            <input
              {...register('price_cents', { valueAsNumber: true })}
              type="number"
              min={0}
              className={INPUT}
            />
          </Field>
          <Field label="Payment Mode" error={errors.payment_mode?.message}>
            <select {...register('payment_mode')} className={SELECT}>
              <option value="per_player">Per Player</option>
              <option value="per_team">Per Team</option>
            </select>
          </Field>
        </div>

        {/* ── Team size & capacity ── */}
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

        {/* ── Dates ── */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Season Start" error={errors.season_start_date?.message}>
            <input {...register('season_start_date')} type="date" className={INPUT} />
          </Field>
          <Field label="Season End" error={errors.season_end_date?.message}>
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

        {/* ── Venue ── */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Venue / Location</p>
          <div className="space-y-4">
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
        </div>

        {/* ── Organizer contact ── */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Organizer Contact</p>
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
        <div className="border-t pt-4">
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

        {/* ── League Rules ── */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">League Rules</p>
          <div className="space-y-3">
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
                  <a href="/admin/settings/league-rules" className="underline">
                    Create one in Settings → League Rules
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
                placeholder="League rules shown to players on the league page…"
                className={`${INPUT} font-mono text-xs leading-relaxed resize-y`}
              />
              {rulesContent && selectedTemplateId && (
                <p className="text-xs text-gray-400 mt-1">
                  Editing here only affects this league — the template is not modified.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-md font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {loading ? 'Creating…' : 'Create League'}
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
