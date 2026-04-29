'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

const planSchema = z.object({
  league_id: z.string().uuid(),
  name: z.string().min(2),
  installments: z.coerce.number().int().min(2).max(12),
  interval_days: z.coerce.number().int().min(7).max(90),
  upfront_percent: z.coerce.number().int().min(0).max(100).default(0),
  enabled: z.boolean().default(true),
})

export async function upsertPaymentPlan(input: z.infer<typeof planSchema>) {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('payment_plans')
    .upsert(
      { organization_id: org.id, ...parsed.data },
      { onConflict: 'league_id' }
    )

  if (error) return { error: error.message }
  revalidatePath(`/admin/events/${parsed.data.league_id}`)
  return { error: null }
}

export async function deletePaymentPlan(leagueId: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  await supabase
    .from('payment_plan_enrollments')
    .update({ status: 'cancelled' })
    .eq('organization_id', org.id)
    .eq('league_id', leagueId)
    .eq('status', 'active')

  const { error } = await supabase
    .from('payment_plans')
    .delete()
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath(`/admin/events/${leagueId}`)
  return { error: null }
}

export async function createEnrollment(input: {
  leagueId: string
  planId: string
  registrationId: string
  totalCents: number
}) {
  const supabase = createServiceRoleClient()

  const { data: plan } = await supabase
    .from('payment_plans')
    .select('*')
    .eq('id', input.planId)
    .single()

  if (!plan) return { error: 'Payment plan not found' }

  const upfrontCents = Math.round(input.totalCents * (plan.upfront_percent / 100))
  const remainingCents = input.totalCents - upfrontCents
  const installmentCents = Math.round(remainingCents / (plan.installments - (plan.upfront_percent > 0 ? 1 : 0)))

  const installments = []
  const now = new Date()

  if (plan.upfront_percent > 0) {
    installments.push({ amount_cents: upfrontCents, due_date: now.toISOString(), status: 'pending', installment_number: 1 })
  }

  const remainingCount = plan.installments - (plan.upfront_percent > 0 ? 1 : 0)
  for (let i = 0; i < remainingCount; i++) {
    const due = new Date(now)
    due.setDate(due.getDate() + plan.interval_days * (i + (plan.upfront_percent > 0 ? 0 : 0)))
    installments.push({
      amount_cents: installmentCents,
      due_date: due.toISOString(),
      status: 'pending',
      installment_number: (plan.upfront_percent > 0 ? 2 : 1) + i,
    })
  }

  const { data: enrollment, error: eErr } = await supabase
    .from('payment_plan_enrollments')
    .insert({
      registration_id: input.registrationId,
      league_id: input.leagueId,
      plan_id: input.planId,
      organization_id: plan.organization_id,
      total_cents: input.totalCents,
      status: 'active',
    })
    .select('id')
    .single()

  if (eErr || !enrollment) return { error: eErr?.message ?? 'Failed to create enrollment' }

  await supabase.from('payment_plan_installments').insert(
    installments.map(inst => ({ ...inst, enrollment_id: enrollment.id, organization_id: plan.organization_id }))
  )

  return { error: null, enrollmentId: enrollment.id }
}
