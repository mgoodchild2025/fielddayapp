'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { canAccess, getActiveLeagueCount } from '@/lib/features'
import type { Database } from '@/types/database'

type LeagueStatus = Database['public']['Tables']['leagues']['Row']['status']

const createLeagueSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  event_type: z.enum(['league', 'tournament', 'pickup', 'drop_in']).default('league'),
  league_type: z.enum(['team', 'individual', 'dropin', 'tournament']),
  sport: z.string().default('beach_volleyball'),
  price_cents: z.coerce.number().min(0).default(0),
  payment_mode: z.enum(['per_player', 'per_team']).default('per_player'),
  max_teams: z.coerce.number().optional(),
  max_participants: z.coerce.number().optional(),
  min_team_size: z.coerce.number().default(4),
  max_team_size: z.coerce.number().default(8),
  season_start_date: z.string().optional(),
  season_end_date: z.string().optional(),
  registration_opens_at: z.string().optional(),
  registration_closes_at: z.string().optional(),
  waiver_version_id: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  age_group: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  venue_type: z.enum(['indoor', 'outdoor', 'both']).optional(),
  venue_surface: z.string().optional(),
  organizer_name: z.string().optional(),
  organizer_email: z.string().email().optional().or(z.literal('')),
  organizer_phone: z.string().optional(),
  team_join_policy: z.enum(['open', 'captain_invite', 'admin_only']).default('open'),
  pickup_join_policy: z.enum(['public', 'private']).default('public'),
})

export async function createLeague(
  input: z.infer<typeof createLeagueSchema> & {
    rule_template_id?: string
    rules_content?: string
  }
) {
  const { rule_template_id, rules_content, ...rest } = input
  const parsed = createLeagueSchema.safeParse(rest)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const hasMultiple = await canAccess(org.id, 'multiple_leagues')
  if (!hasMultiple) {
    const count = await getActiveLeagueCount(org.id)
    if (count >= 1) return { data: null, error: 'UPGRADE_REQUIRED' }
  }

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('leagues')
    .insert({
      organization_id: org.id,
      ...parsed.data,
      season_start_date: parsed.data.season_start_date || null,
      season_end_date: parsed.data.season_end_date || null,
      registration_opens_at: parsed.data.registration_opens_at || null,
      registration_closes_at: parsed.data.registration_closes_at || null,
      max_teams: parsed.data.max_teams ?? null,
      max_participants: parsed.data.max_participants ?? null,
      waiver_version_id: parsed.data.waiver_version_id ?? null,
      age_group: parsed.data.age_group || null,
      venue_name: parsed.data.venue_name || null,
      venue_address: parsed.data.venue_address || null,
      venue_type: parsed.data.venue_type ?? null,
      venue_surface: parsed.data.venue_surface || null,
      organizer_name: parsed.data.organizer_name || null,
      organizer_email: parsed.data.organizer_email || null,
      organizer_phone: parsed.data.organizer_phone || null,
      team_join_policy: parsed.data.team_join_policy,
      rule_template_id: rule_template_id || null,
      rules_content: rules_content || null,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  revalidatePath('/admin/events')
  return { data, error: null }
}

export async function updateLeagueStatus(leagueId: string, status: LeagueStatus) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('leagues')
    .update({ status })
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { data: null, error: error.message }

  revalidatePath(`/admin/events/${leagueId}`)
  return { data: null, error: null }
}

export async function deleteLeague(leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  // Delete child records in safe order (cascade may not cover everything)
  await supabase.from('team_members').delete().eq('organization_id', org.id)
    // only members belonging to teams in this league
    .in('team_id',
      (await supabase.from('teams').select('id').eq('league_id', leagueId).eq('organization_id', org.id))
        .data?.map((t) => t.id) ?? []
    )

  await supabase.from('teams').delete().eq('league_id', leagueId).eq('organization_id', org.id)
  await supabase.from('registrations').delete().eq('league_id', leagueId).eq('organization_id', org.id)
  await supabase.from('games').delete().eq('league_id', leagueId).eq('organization_id', org.id)
  await supabase.from('payments').delete().eq('league_id', leagueId).eq('organization_id', org.id)

  const { error } = await supabase
    .from('leagues')
    .delete()
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/events')
  return { error: null }
}

export async function updateLeague(
  leagueId: string,
  updates: Partial<z.infer<typeof createLeagueSchema>> & {
    waiver_version_id?: string | null
    rule_template_id?: string | null
    rules_content?: string | null
  }
) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('leagues')
    .update(updates)
    .eq('id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { data: null, error: error.message }

  revalidatePath(`/admin/events/${leagueId}`)
  return { data: null, error: null }
}
