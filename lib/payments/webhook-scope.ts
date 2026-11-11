import type { createServiceRoleClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof createServiceRoleClient>

/** Metadata key → the table its id(s) live in. Every one has `organization_id`. */
const TABLE_FOR = {
  registrationId: 'registrations',
  leagueId: 'leagues',
  teamId: 'teams',
  paymentId: 'payments',
  merchOrderIds: 'merchandise_orders',
  installmentId: 'payment_plan_installments',
  enrollmentId: 'payment_plan_enrollments',
  sessionId: 'event_sessions',
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Does everything a Stripe event's metadata points at belong to this org?
 *
 * The org webhook verifies the signature with the HOST org's own secret — a
 * value that org's admin chose and knows, so they can sign any event they like
 * and post it to their own site. The handlers then act on the ids in the
 * metadata, which used to be trusted: a hostile admin could mark another org's
 * registration active or its merch orders paid. An event that names a row in
 * another org is refused outright.
 *
 * Rows that no longer exist are fine (a registration removed mid-checkout must
 * not stop its payment being recorded); ids that aren't UUIDs are refused.
 */
export async function metadataBelongsToOrg(
  db: Db,
  orgId: string,
  metadata: Record<string, string | undefined | null> | null | undefined,
): Promise<boolean> {
  const md = metadata ?? {}
  if (md.orgId && md.orgId !== orgId) return false

  const checks: Promise<boolean>[] = []
  for (const [key, table] of Object.entries(TABLE_FOR)) {
    const ids = (md[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) continue
    if (!ids.every((id) => UUID.test(id))) return false
    checks.push(
      Promise.resolve(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any).from(table).select('id, organization_id').in('id', ids),
      ).then(({ data, error }: { data: { organization_id: string | null }[] | null; error: unknown }) =>
        !error && (data ?? []).every((row) => row.organization_id === orgId),
      ),
    )
  }
  return (await Promise.all(checks)).every(Boolean)
}
