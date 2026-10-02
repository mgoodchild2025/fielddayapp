import { createServiceRoleClient } from '@/lib/supabase/service'

// Org-wide marketing-consent lookups for the send layer (announcements,
// including the reminders cron, and the admin players list). Not in a
// 'use server' file: those exports are public endpoints, and these return an
// org's consent lists for any orgId they're given.

/**
 * Batch marketing-consent lookup for the send layer. Returns the subset of the
 * given user ids who currently have email / SMS marketing consent in this org.
 */
export async function getMarketingConsentBatch(
  orgId: string,
  userIds: string[]
): Promise<{ email: Set<string>; sms: Set<string> }> {
  const email = new Set<string>()
  const sms = new Set<string>()
  if (userIds.length === 0) return { email, sms }

  const db = createServiceRoleClient()

  const { data } = await db
    .from('player_consents')
    .select('user_id, consent_type, consent_given, withdrawn_at, consented_at')
    .eq('organization_id', orgId)
    .in('user_id', userIds)
    .in('consent_type', ['marketing_email', 'marketing_sms'])
    .order('consented_at', { ascending: false })

  // Take the latest row per (user, type)
  const seen = new Set<string>()
  for (const r of (data ?? []) as { user_id: string; consent_type: string; consent_given: boolean; withdrawn_at: string | null }[]) {
    const key = `${r.user_id}:${r.consent_type}`
    if (seen.has(key)) continue
    seen.add(key)
    if (r.consent_given && !r.withdrawn_at) {
      if (r.consent_type === 'marketing_email') email.add(r.user_id)
      else if (r.consent_type === 'marketing_sms') sms.add(r.user_id)
    }
  }
  return { email, sms }
}

/**
 * All user ids in an org that currently have marketing-email consent (latest
 * non-withdrawn ledger row per user). Used by the outbound "advertise" audience.
 */
export async function getMarketingOptInUserIds(orgId: string): Promise<string[]> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('player_consents')
    .select('user_id, consent_given, withdrawn_at, consented_at')
    .eq('organization_id', orgId)
    .eq('consent_type', 'marketing_email')
    .order('consented_at', { ascending: false })

  const seen = new Set<string>()
  const optedIn: string[] = []
  for (const r of (data ?? []) as { user_id: string; consent_given: boolean; withdrawn_at: string | null }[]) {
    if (seen.has(r.user_id)) continue  // latest row per user wins
    seen.add(r.user_id)
    if (r.consent_given && !r.withdrawn_at) optedIn.push(r.user_id)
  }
  return optedIn
}
