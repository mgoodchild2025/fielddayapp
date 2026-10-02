'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { recordConsents } from '@/lib/consents'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'
import { assertOrgAdmin } from '@/lib/auth'

// Types moved to lib/consents.ts; re-exported here so existing imports hold.
export type { ConsentType, ConsentRow } from '@/lib/consents'



/** Read request IP + user agent from headers for consent metadata. */
export async function consentRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
  const userAgent = h.get('user-agent') || null
  return { ip, userAgent }
}

/**
 * Insert one or more consent rows (append-only ledger). Used by the
 * registration handler and the reconsent flow. Non-throwing; returns error.
 */

/**
 * These per-player loaders are public endpoints (this is a 'use server'
 * file): only the player themselves, or an active admin of the current org,
 * may read a player's consent state — and only for the current org.
 */
async function assertSelfOrOrgAdmin(orgId: string, userId: string): Promise<void> {
  const org = await getCurrentOrg(await headers())
  if (orgId !== org.id) throw new Error('Unauthorized')
  const { data: { user } } = await (await createServerClient()).auth.getUser()
  if (!user) throw new Error('Unauthorized')
  if (user.id === userId) return
  const auth = await assertOrgAdmin(org)
  if (auth.error) throw new Error('Unauthorized')
}

/**
 * Current marketing opt-in state for a player within an org, derived from the
 * latest non-withdrawn ledger row per type. Per-tenant (CASL §10.3 isolation).
 */
export async function getMarketingConsent(
  orgId: string,
  userId: string
): Promise<{ email: boolean; sms: boolean }> {
  await assertSelfOrOrgAdmin(orgId, userId)
  const db = createServiceRoleClient()

  const { data } = await db
    .from('player_consents')
    .select('consent_type, consent_given, withdrawn_at, consented_at')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .in('consent_type', ['marketing_email', 'marketing_sms'])
    .order('consented_at', { ascending: false })

  const latest = (type: string) =>
    (data ?? []).find((r: { consent_type: string }) => r.consent_type === type) as
      | { consent_given: boolean; withdrawn_at: string | null }
      | undefined

  const isOn = (type: string) => {
    const r = latest(type)
    return !!r && r.consent_given && !r.withdrawn_at
  }
  return { email: isOn('marketing_email'), sms: isOn('marketing_sms') }
}

/**
 * Player opts in or out of a marketing channel from account settings.
 * Opt-in writes a new consent row; opt-out withdraws the active one.
 */
export async function setMarketingConsent(
  type: 'marketing_email' | 'marketing_sms',
  optIn: boolean
): Promise<{ error: string | null }> {
  const h = await headers()
  const org = await getCurrentOrg(h)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const meta = await consentRequestMeta()

  if (optIn) {
    await recordConsents([{
      organization_id: org.id, user_id: user.id,
      consent_type: type, consent_given: true,
      ip_address: meta.ip, user_agent: meta.userAgent,
    }])
  } else {
    // Withdraw the latest active row of this type

    const { data: active } = await db
      .from('player_consents')
      .select('id')
      .eq('organization_id', org.id).eq('user_id', user.id)
      .eq('consent_type', type).eq('consent_given', true).is('withdrawn_at', null)
      .order('consented_at', { ascending: false }).limit(1).maybeSingle()
    if (active) {

      await db.from('player_consents')
        .update({ withdrawn_at: new Date().toISOString() }).eq('id', active.id)
    }
  }

  revalidatePath('/profile')
  return { error: null }
}

export interface PendingReconsent {
  slug: string
  title: string
  version: string
  versionId: string
  summary: string | null
}

/**
 * Whether the player must re-accept the privacy policy in this org.
 * Mirrors the tenant reconsent check: a privacy-policy version with
 * requires_reconsent=true that is newer than the player's last privacy
 * consent in this org triggers a block.
 */
export async function getPlayerPendingReconsent(orgId: string, userId: string): Promise<PendingReconsent | null> {
  await assertSelfOrOrgAdmin(orgId, userId)
  const db = createServiceRoleClient()

  // Latest published privacy-policy version that requires reconsent

  const { data: versions } = await db
    .from('legal_document_versions')
    .select('id, version, published_at, requires_reconsent, reconsent_summary, document:legal_documents!legal_document_versions_document_id_fkey(slug, title)')
    .eq('requires_reconsent', true)
    .order('published_at', { ascending: false })
    .limit(50)
  const v = (versions ?? []).find((row: { document: { slug: string } | null }) => row.document?.slug === 'privacy-policy')
  if (!v) return null

  // The player's most recent privacy consent in this org

  const { data: last } = await db
    .from('player_consents')
    .select('consented_at')
    .eq('organization_id', orgId).eq('user_id', userId)
    .eq('consent_type', 'privacy_policy')
    .order('consented_at', { ascending: false })
    .limit(1).maybeSingle()

  const acceptedAt = last?.consented_at ? new Date(last.consented_at) : null
  const requiredSince = new Date(v.published_at)
  if (acceptedAt && acceptedAt >= requiredSince) return null

  return {
    slug: 'privacy-policy',
    title: v.document?.title ?? 'Privacy Policy',
    version: v.version,
    versionId: v.id,
    summary: v.reconsent_summary ?? null,
  }
}

/** Player accepts the updated privacy policy (writes a fresh consent row). */
export async function acceptPlayerReconsent(versionId: string, versionLabel: string): Promise<{ error: string | null }> {
  const h = await headers()
  const org = await getCurrentOrg(h)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const meta = await consentRequestMeta()
  const res = await recordConsents([{
    organization_id: org.id, user_id: user.id,
    consent_type: 'privacy_policy', consent_given: true,
    document_slug: 'privacy-policy', document_version: versionLabel,
    legal_document_version_id: versionId,
    ip_address: meta.ip, user_agent: meta.userAgent,
  }])
  if (res.error) return res

  revalidatePath('/', 'layout')
  return { error: null }
}



/**
 * One-click unsubscribe (from a commercial email link). Withdraws the active
 * marketing consent for a user in an org. No login — gated by the signed
 * token, verified HERE (it used to take orgId/userId directly, so anyone
 * could unsubscribe anyone).
 */
export async function unsubscribeMarketing(token: string): Promise<{ error: string | null }> {
  const parsed = verifyUnsubscribeToken(token)
  if (!parsed) return { error: 'Invalid link' }
  const { orgId, userId, type } = parsed
  const db = createServiceRoleClient()

  const { data: active } = await db
    .from('player_consents')
    .select('id')
    .eq('organization_id', orgId).eq('user_id', userId)
    .eq('consent_type', type).eq('consent_given', true).is('withdrawn_at', null)
    .order('consented_at', { ascending: false }).limit(1).maybeSingle()
  if (active) {

    await db.from('player_consents')
      .update({ withdrawn_at: new Date().toISOString() }).eq('id', active.id)
  } else {
    // No active row → record an explicit opt-out so the suppression sticks
    await recordConsents([{ organization_id: orgId, user_id: userId, consent_type: type, consent_given: false }])
  }
  return { error: null }
}

/** Player-facing summary of accepted privacy/waiver consents (Legal Agreements view). */
export async function getPlayerConsentSummary(orgId: string, userId: string) {
  await assertSelfOrOrgAdmin(orgId, userId)
  const db = createServiceRoleClient()

  const { data } = await db
    .from('player_consents')
    .select('consent_type, document_slug, document_version, consented_at')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .in('consent_type', ['privacy_policy', 'waiver'])
    .order('consented_at', { ascending: false })
  return (data ?? []) as { consent_type: string; document_slug: string | null; document_version: string | null; consented_at: string }[]
}
