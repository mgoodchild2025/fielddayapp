'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { randomUUID } from 'crypto'

const sessionSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  scheduled_at: z.string().min(1),
  location: z.string().optional(),
  capacity: z.coerce.number().int().min(1).max(500),
  price_cents: z.coerce.number().int().min(0),
  sport: z.string().default('multi'),
})

export async function createDropInSession(input: z.infer<typeof sessionSchema>) {
  const parsed = sessionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
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
  const supabase = createServiceRoleClient()

  await supabase.from('drop_in_registrations').delete().eq('session_id', id)
  const { error } = await supabase
    .from('drop_in_sessions')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/dropins')
  return { error: null }
}

export async function registerForDropIn(sessionId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceRoleClient()

  const { data: session } = await service
    .from('drop_in_sessions')
    .select('capacity, organization_id, status')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }
  if (session.status === 'cancelled') return { error: 'This session has been cancelled' }

  const { count: registered } = await service
    .from('drop_in_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'registered')

  const isFull = (registered ?? 0) >= session.capacity
  const status = isFull ? 'waitlisted' : 'registered'

  const { data: existing } = await service
    .from('drop_in_registrations')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    if (existing.status === 'registered' || existing.status === 'waitlisted') {
      return { error: 'You are already registered for this session' }
    }
    // Re-register if previously cancelled
    const qr_token = randomUUID()
    await service
      .from('drop_in_registrations')
      .update({ status, qr_token })
      .eq('id', existing.id)
  } else {
    const qr_token = randomUUID()
    const { error } = await service.from('drop_in_registrations').insert({
      session_id: sessionId,
      user_id: user.id,
      organization_id: session.organization_id,
      status,
      qr_token,
    })
    if (error) return { error: error.message }
  }

  revalidatePath(`/dropins/${sessionId}`)
  return { error: null, status }
}

export async function checkInDropIn(registrationId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
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
