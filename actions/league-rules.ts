'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

async function requireAdmin() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const, org: null as never, db: null as never }

  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' as const, org: null as never, db: null as never }
  }
  return { error: null as null, org, db }
}

// ─── Create / update template ─────────────────────────────────────────────────

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2),
  content: z.string().min(10),
})

export async function upsertRuleTemplate(input: z.infer<typeof upsertSchema>) {
  const parsed = upsertSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const { error, org, db } = await requireAdmin()
  if (error) return { data: null, error }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  if (parsed.data.id) {
    const { data, error: e } = await anyDb
      .from('league_rule_templates')
      .update({ title: parsed.data.title, content: parsed.data.content, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.id)
      .eq('organization_id', org.id)
      .select('id')
      .single()
    if (e) return { data: null, error: e.message }
    revalidatePath('/admin/settings/league-rules')
    return { data, error: null }
  }

  const { data, error: e } = await anyDb
    .from('league_rule_templates')
    .insert({ organization_id: org.id, title: parsed.data.title, content: parsed.data.content })
    .select('id')
    .single()
  if (e) return { data: null, error: e.message }
  revalidatePath('/admin/settings/league-rules')
  return { data, error: null }
}

// ─── Delete template ──────────────────────────────────────────────────────────

export async function deleteRuleTemplate(templateId: string) {
  const { error, org, db } = await requireAdmin()
  if (error) return { error }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  // Clear template reference from any leagues using it (keep their rules_content)
  await anyDb
    .from('leagues')
    .update({ rule_template_id: null })
    .eq('organization_id', org.id)
    .eq('rule_template_id', templateId)

  const { error: e } = await anyDb
    .from('league_rule_templates')
    .delete()
    .eq('id', templateId)
    .eq('organization_id', org.id)
  if (e) return { error: e.message }

  revalidatePath('/admin/settings/league-rules')
  revalidatePath('/admin/leagues')
  return { error: null }
}
