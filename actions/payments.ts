'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

const recordManualPaymentSchema = z.object({
  registrationId: z.string().uuid(),
  userId: z.string().uuid(),
  leagueId: z.string().uuid(),
  amountCents: z.number().min(0),
  currency: z.string().default('cad'),
  method: z.enum(['cash', 'etransfer']),
  notes: z.string().optional(),
})

export async function recordManualPayment(input: z.infer<typeof recordManualPaymentSchema>) {
  const parsed = recordManualPaymentSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()

  const { error } = await supabase.from('payments').insert({
    organization_id: org.id,
    registration_id: parsed.data.registrationId,
    user_id: parsed.data.userId,
    league_id: parsed.data.leagueId,
    amount_cents: parsed.data.amountCents,
    currency: parsed.data.currency,
    status: 'paid',
    payment_method: parsed.data.method,
    notes: parsed.data.notes ?? null,
    paid_at: new Date().toISOString(),
  })

  if (error) return { data: null, error: error.message }

  // Activate the registration
  await supabase.from('registrations').update({ status: 'active' }).eq('id', parsed.data.registrationId)

  revalidatePath('/admin/payments')
  return { data: null, error: null }
}
