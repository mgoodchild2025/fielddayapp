import type { createServiceRoleClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof createServiceRoleClient>

/** Pay-later methods: a row with one of these and status 'pending' is money still owed. */
export const OFFLINE_METHODS = ['cash', 'etransfer', 'cheque', 'other'] as const

/**
 * A registration's card payment was just confirmed: drop the never-paid
 * cash / e-transfer / cheque rows it supersedes. A card checkout inserts a
 * NEW payment row, so a player who first picked e-transfer (or fell back to
 * it when card checkout was down) and then paid by card still had the old
 * pending row — and the success page, event page and dashboard all said
 * "Payment outstanding — e-transfer" after a successful card payment.
 *
 * Only pending offline rows of this registration go; paid / manual / refunded
 * rows and team-fee rows (payment_type 'team') are never touched. Card rows
 * carry no payment_method, so they can't match.
 */
export async function clearSupersededOfflinePayments(db: Db, orgId: string, registrationId: string): Promise<void> {
  const { error } = await db
    .from('payments')
    .delete()
    .eq('organization_id', orgId)
    .eq('registration_id', registrationId)
    .eq('status', 'pending')
    .in('payment_method', [...OFFLINE_METHODS])
    .or('payment_type.is.null,payment_type.neq.team')
  if (error) console.error('[payments] clearing superseded offline rows failed:', error.message)
}
