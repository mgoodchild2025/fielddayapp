'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

const sendSchema = z.object({
  title: z.string().min(1, 'Subject required'),
  body: z.string().min(1, 'Message body required'),
  audience_type: z.enum(['org', 'league', 'team']).default('org'),
  league_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
})

export async function sendAnnouncement(input: FormData) {
  const raw = {
    title: input.get('title') as string,
    body: input.get('body') as string,
    audience_type: input.get('audience_type') as string || 'org',
    league_id: (input.get('league_id') as string) || undefined,
    team_id: (input.get('team_id') as string) || undefined,
  }

  const parsed = sendSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Verify sender is at least league_admin
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!member || !['org_admin', 'league_admin'].includes(member.role)) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('announcements')
    .insert({
      organization_id: org.id,
      title: parsed.data.title,
      body: parsed.data.body,
      audience_type: parsed.data.audience_type,
      league_id: parsed.data.league_id ?? null,
      team_id: parsed.data.team_id ?? null,
      sent_by: user.id,
      sent_at: new Date().toISOString(),
    })

  if (error) return { error: error.message }

  revalidatePath('/admin/messages')
  return { error: null }
}

export async function deleteAnnouncement(id: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/admin/messages')
  return { error: null }
}
