'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

const createTeamSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().min(2),
  color: z.string().optional(),
})

export async function createTeam(input: z.infer<typeof createTeamSchema>) {
  const parsed = createTeamSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      organization_id: org.id,
      league_id: parsed.data.leagueId,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  // Add creator as captain
  await supabase.from('team_members').insert({
    organization_id: org.id,
    team_id: team.id,
    user_id: user.id,
    role: 'captain',
    status: 'active',
  })

  // Update org member role to captain if they're a player
  await supabase
    .from('org_members')
    .update({ role: 'captain' })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('role', 'player')

  revalidatePath(`/admin/leagues/${parsed.data.leagueId}/teams`)
  return { data: team, error: null }
}

const invitePlayerSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
})

export async function invitePlayerToTeam(input: z.infer<typeof invitePlayerSchema>) {
  const parsed = invitePlayerSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Verify requester is captain
  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', parsed.data.teamId)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'captain') return { data: null, error: 'Only captains can invite players' }

  // Check if user already exists in org
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .single()

  const { error } = await supabase.from('team_members').insert({
    organization_id: org.id,
    team_id: parsed.data.teamId,
    user_id: existingProfile?.id ?? null,
    invited_email: parsed.data.email,
    role: 'player',
    status: 'invited',
  })

  if (error) return { data: null, error: error.message }

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return { data: null, error: null }
}
