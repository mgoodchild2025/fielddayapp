'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'
import type { TierTemplateSpec } from '@/lib/playoff-templates'

// Org-saved playoff format templates (flexible brackets Phase 3).
// Built-in formats live in lib/playoff-templates.ts; these actions manage the
// org's own saved shapes.

const tierSpecSchema = z.object({
  name: z.string().min(1).max(60),
  seedFrom: z.number().int().min(1),
  seedTo: z.number().int().min(1),
  bracketType: z.enum(['single_elimination', 'double_elimination', 'all_play']),
  thirdPlaceGame: z.boolean(),
  inflowFromTierIndex: z.number().int().min(0).nullable(),
  byeSeeds: z.number().int().min(0),
})

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(80),
  teamCount: z.number().int().min(2).max(256),
  tiers: z.array(tierSpecSchema).min(1).max(8),
})

export interface SavedPlayoffTemplate {
  id: string
  name: string
  teamCount: number
  tiers: TierTemplateSpec[]
}

export async function listPlayoffTemplates(): Promise<SavedPlayoffTemplate[]> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return []

  const db = createServiceRoleClient()
  const { data } = await db
    .from('org_playoff_templates')
    .select('id, name, team_count, tiers')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    teamCount: r.team_count,
    tiers: (r.tiers as unknown as TierTemplateSpec[]) ?? [],
  }))
}

export async function savePlayoffTemplate(input: {
  name: string
  teamCount: number
  tiers: TierTemplateSpec[]
}): Promise<{ error: string | null }> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid template' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('org_playoff_templates')
    .upsert(
      {
        organization_id: org.id,
        name: parsed.data.name,
        team_count: parsed.data.teamCount,
        tiers: parsed.data.tiers,
      },
      { onConflict: 'organization_id,name' },
    )

  if (error) return { error: error.message }
  return { error: null }
}

export async function deletePlayoffTemplate(id: string): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('org_playoff_templates')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  return { error: null }
}
