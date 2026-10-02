'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

const sessionSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  scheduled_at: z.string().min(1),
  location: z.string().optional(),
  capacity: z.coerce.number().int().min(1).max(500),
  price_cents: z.coerce.number().int().min(0),
  sport: z.string().default('multi'),
})

/**
 * Admin gate for the drop-in management actions. These are 'use server'
 * exports that write through the service-role client, which bypasses RLS —
 * without this check any visitor to an org's site could create, reprice or
 * delete that org's paid drop-in sessions.
 */
async function requireDropInAdmin(orgId: string): Promise<{ error: string } | null> {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id).eq('status', 'active')
    .in('role', ['org_admin', 'league_admin'])
    .maybeSingle()

  if (!member) return { error: 'Admin access required' }
  return null
}

export async function createDropInSession(input: z.infer<typeof sessionSchema>) {
  const parsed = sessionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const denied = await requireDropInAdmin(org.id)
  if (denied) return denied
  const supabase = createServiceRoleClient()

  const { error } = await supabase.from('drop_in_sessions').insert({
    organization_id: org.id,
    ...parsed.data,
    description: parsed.data.description || null,
    location: parsed.data.location || null,
    status: 'open',
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/dropins')
  return { error: null }
}

export async function updateDropInSession(id: string, input: z.infer<typeof sessionSchema>) {
  const parsed = sessionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const denied = await requireDropInAdmin(org.id)
  if (denied) return denied
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('drop_in_sessions')
    .update({ ...parsed.data, description: parsed.data.description || null, location: parsed.data.location || null })
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/dropins')
  revalidatePath(`/admin/dropins/${id}`)
  return { error: null }
}

export async function deleteDropInSession(id: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const denied = await requireDropInAdmin(org.id)
  if (denied) return denied
  const supabase = createServiceRoleClient()

  // Org-scope the child delete too: an unscoped session id would otherwise
  // reach another org's registrations.
  await supabase.from('drop_in_registrations').delete().eq('session_id', id).eq('organization_id', org.id)
  const { error } = await supabase
    .from('drop_in_sessions')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/dropins')
  return { error: null }
}

// registerForDropIn was removed: nothing called it, and as a public action it
// registered the caller for a paid drop-in session without any payment.
// Drop-in registration goes through the registration flow (createRegistration).

export async function checkInDropIn(registrationId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const denied = await requireDropInAdmin(org.id)
  if (denied) return denied
  const service = createServiceRoleClient()

  const { error } = await service
    .from('drop_in_registrations')
    .update({ status: 'attended', checked_in_at: new Date().toISOString() })
    .eq('id', registrationId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  return { error: null }
}

export async function checkInByToken(token: string) {
  const service = createServiceRoleClient()
  const { data: reg } = await service
    .from('drop_in_registrations')
    .select('id, status, session_id, organization_id')
    .eq('qr_token', token)
    .single()

  if (!reg) return { error: 'Invalid QR code' }
  if (reg.status === 'attended') return { error: 'Already checked in', alreadyIn: true }
  if (reg.status !== 'registered') return { error: 'Registration is not active' }

  const { error } = await service
    .from('drop_in_registrations')
    .update({ status: 'attended', checked_in_at: new Date().toISOString() })
    .eq('id', reg.id)

  if (error) return { error: error.message }
  revalidatePath(`/admin/dropins/${reg.session_id}`)
  return { error: null }
}
