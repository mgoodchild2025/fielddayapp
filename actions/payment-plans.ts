'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'

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
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }
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
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }
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

// createEnrollment moved to lib/payment-plans.ts — it is only called
// server-side (Stripe checkout route) and must not be a public action.

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
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }
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

// getEnrollmentForRegistration (+ EnrollmentWithInstallments) moved to
// lib/payment-plans.ts — only called from server components, and exposing an
// unauthenticated read of payment schedules as an action was unnecessary.
