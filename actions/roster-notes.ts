'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { z } from 'zod'

export type RosterNote = {
  id: string
  name: string
  email: string | null
  note: string | null
  created_at: string
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function assertCanManage(teamId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', org: null, user: null }

  const db = createServiceRoleClient()

  // Is org admin / league admin?
  const { data: orgMember } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (orgMember && ['org_admin', 'league_admin'].includes(orgMember.role)) {
    return { error: null, org, user }
  }

  // Is captain / coach of this team?
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (membership && ['captain', 'coach'].includes(membership.role)) {
    return { error: null, org, user }
  }

  return { error: 'Not authorised', org: null, user: null }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function getRosterNotes(teamId: string): Promise<RosterNote[]> {
  const { error, org } = await assertCanManage(teamId)
  if (error || !org) return []

  const db = createServiceRoleClient()
  const { data } = await db
    .from('roster_notes' as never)
    .select('id, name, email, note, created_at')
    .eq('team_id', teamId)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: true })
    .returns<RosterNote[]>()

  return data ?? []
}

// ─── Add ──────────────────────────────────────────────────────────────────────

const addSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  note: z.string().max(500).optional(),
})

export async function addRosterNote(input: {
  teamId: string
  name: string
  email?: string
  note?: string
}): Promise<{ error: string | null; data: RosterNote | null }> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input', data: null }

  const { error, org, user } = await assertCanManage(parsed.data.teamId)
  if (error || !org || !user) return { error: error ?? 'Not authorised', data: null }

  // Enforce cap of 50 notes per team
  const db = createServiceRoleClient()
  const { count } = await db
    .from('roster_notes' as never)
    .select('*', { count: 'exact', head: true })
    .eq('team_id', parsed.data.teamId)
    .eq('organization_id', org.id)

  if ((count ?? 0) >= 50) return { error: 'Maximum of 50 planning entries per team', data: null }

  const { data, error: insertError } = await db
    .from('roster_notes' as never)
    .insert({
      organization_id: org.id,
      team_id: parsed.data.teamId,
      name: parsed.data.name.trim(),
      email: parsed.data.email?.trim() || null,
      note: parsed.data.note?.trim() || null,
      created_by: user.id,
    } as never)
    .select('id, name, email, note, created_at')
    .single()
    .returns<RosterNote>()

  if (insertError) return { error: insertError.message, data: null }

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return { error: null, data: data as unknown as RosterNote }
}

// ─── Update ───────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  note: z.string().max(500).optional(),
})

export async function updateRosterNote(input: {
  id: string
  teamId: string
  name: string
  email?: string
  note?: string
}): Promise<{ error: string | null }> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }

  const { error, org } = await assertCanManage(parsed.data.teamId)
  if (error || !org) return { error: error ?? 'Not authorised' }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('roster_notes' as never)
    .update({
      name: parsed.data.name.trim(),
      email: parsed.data.email?.trim() || null,
      note: parsed.data.note?.trim() || null,
    } as never)
    .eq('id', parsed.data.id)
    .eq('team_id', parsed.data.teamId)
    .eq('organization_id', org.id)

  if (updateError) return { error: updateError.message }

  revalidatePath(`/teams/${parsed.data.teamId}`)
  return { error: null }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRosterNote(noteId: string, teamId: string): Promise<{ error: string | null }> {
  if (!noteId || !teamId) return { error: 'Invalid input' }

  const { error, org } = await assertCanManage(teamId)
  if (error || !org) return { error: error ?? 'Not authorised' }

  const db = createServiceRoleClient()
  const { error: deleteError } = await db
    .from('roster_notes' as never)
    .delete()
    .eq('id', noteId)
    .eq('team_id', teamId)
    .eq('organization_id', org.id)

  if (deleteError) return { error: deleteError.message }

  revalidatePath(`/teams/${teamId}`)
  return { error: null }
}
