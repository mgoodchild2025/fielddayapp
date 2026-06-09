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
    installments.push({ amount_cents: upfrontCents, due_date: now.toISOString(), status: 'pending' as const, installment_number: 1 })
  }

  const remainingCount = plan.installments - (plan.upfront_percent > 0 ? 1 : 0)
  for (let i = 0; i < remainingCount; i++) {
    const due = new Date(now)
    // When there is an upfront payment, regular instalments start 1 interval
    // from now (i + 1). When there is no upfront, instalment 1 is due today
    // (i = 0 → 0 days offset) and subsequent ones follow the interval.
    due.setDate(due.getDate() + plan.interval_days * (plan.upfront_percent > 0 ? i + 1 : i))
    installments.push({
      amount_cents: installmentCents,
      due_date: due.toISOString(),
      status: 'pending' as const,
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

/**
 * Admin: marks a single instalment as manually paid.
 * Inserts a payments row, updates the instalment, and completes the enrollment
 * if all instalments are now paid.
 */
export async function adminMarkInstallmentPaid(
  installmentId: string,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = createServiceRoleClient()

  // Fetch installment + enrollment + registration to verify ownership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inst } = await (supabase as any)
    .from('payment_plan_installments')
    .select(`
      id, amount_cents, installment_number, status,
      payment_plan_enrollments!inner(
        id, registration_id, organization_id, status
      )
    `)
    .eq('id', installmentId)
    .maybeSingle()

  if (!inst) return { error: 'Instalment not found' }
  const enrollment = Array.isArray(inst.payment_plan_enrollments)
    ? inst.payment_plan_enrollments[0]
    : inst.payment_plan_enrollments
  if (!enrollment) return { error: 'Enrollment not found' }
  if (enrollment.organization_id !== org.id) return { error: 'Unauthorized' }
  if (inst.status === 'paid') return { error: null } // idempotent

  // Insert a manual payments row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentRow, error: paymentErr } = await (supabase as any)
    .from('payments')
    .insert({
      organization_id: org.id,
      registration_id: enrollment.registration_id,
      amount_cents: inst.amount_cents,
      currency: 'cad',
      status: 'paid',
      payment_method: 'manual',
      payment_type: 'player',
      paid_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (paymentErr) return { error: paymentErr.message }

  // Mark the instalment paid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: instErr } = await (supabase as any)
    .from('payment_plan_installments')
    .update({ status: 'paid', payment_id: paymentRow.id })
    .eq('id', installmentId)

  if (instErr) return { error: instErr.message }

  // Check if all instalments in the enrollment are now paid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: remaining } = await (supabase as any)
    .from('payment_plan_installments')
    .select('id')
    .eq('enrollment_id', enrollment.id)
    .neq('status', 'paid')
    .limit(1)

  if (!remaining || remaining.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('payment_plan_enrollments')
      .update({ status: 'completed' })
      .eq('id', enrollment.id)
  }

  revalidatePath(`/admin/events`)
  return { error: null }
}

export interface EnrollmentWithInstallments {
  id: string
  total_cents: number
  status: string
  plan: { name: string; installments: number; interval_days: number; upfront_percent: number } | null
  installments: Array<{
    id: string
    installment_number: number
    amount_cents: number
    due_date: string
    status: 'pending' | 'paid' | 'failed'
    stripe_checkout_session_id: string | null
  }>
}

/** Returns the active enrollment + instalment schedule for a given registration, or null. */
export async function getEnrollmentForRegistration(
  registrationId: string,
): Promise<EnrollmentWithInstallments | null> {
  const supabase = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollment } = await (supabase as any)
    .from('payment_plan_enrollments')
    .select(`
      id, total_cents, status,
      plan:payment_plans(name, installments, interval_days, upfront_percent),
      installments:payment_plan_installments(
        id, installment_number, amount_cents, due_date, status,
        stripe_checkout_session_id
      )
    `)
    .eq('registration_id', registrationId)
    .in('status', ['active', 'completed'])
    .order('installment_number', { referencedTable: 'payment_plan_installments', ascending: true })
    .maybeSingle()

  return (enrollment as EnrollmentWithInstallments) ?? null
}
