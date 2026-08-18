import { createServiceRoleClient } from '@/lib/supabase/service'

// Server-only payment-plan enrollment helpers. Live in lib/ (NOT actions) on
// purpose: they are called from the Stripe checkout route and server
// components — never from the client — so they must not be publicly invokable
// server-action endpoints.

/**
 * Create a payment-plan enrollment + instalment schedule for a registration.
 * Called server-side from the checkout route once the player picks a plan.
 */
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
