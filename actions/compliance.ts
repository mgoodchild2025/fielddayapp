'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

async function requirePlatformAdmin(): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (db as any)
    .from('profiles').select('platform_role').eq('id', user.id).single()
  if (profile?.platform_role !== 'platform_admin') throw new Error('Platform admin required')
}

export interface OrgComplianceRow {
  orgId: string
  orgName: string
  slug: string
  /** Distinct players who have at least one consent record in this org. */
  trackedPlayers: number
  /** Distinct players with an accepted privacy-policy consent. */
  privacyConsents: number
  /** Distinct players with an accepted waiver consent. */
  waiverConsents: number
  /** Players currently opted in to marketing email (latest non-withdrawn). */
  marketingEmail: number
  /** Players currently opted in to marketing SMS (latest non-withdrawn). */
  marketingSms: number
  /** Players whose latest privacy consent predates the reconsent threshold (or have none). */
  pendingReconsent: number
}

export interface PlatformComplianceOverview {
  /** ISO date the current privacy policy began requiring reconsent, if any. */
  reconsentThreshold: string | null
  reconsentVersion: string | null
  totals: {
    orgs: number
    consentRecords: number
    trackedPlayers: number
    privacyConsents: number
    waiverConsents: number
    marketingEmail: number
    marketingSms: number
    pendingReconsent: number
  }
  orgs: OrgComplianceRow[]
}

type ConsentRecord = {
  organization_id: string
  user_id: string
  consent_type: string
  consent_given: boolean
  withdrawn_at: string | null
  consented_at: string
}

/**
 * Cross-org consent/compliance snapshot for the Super Console.
 * Aggregates the append-only player_consents ledger into per-org metrics.
 */
export async function getPlatformComplianceOverview(): Promise<PlatformComplianceOverview> {
  await requirePlatformAdmin()
  const db = createServiceRoleClient()

  // ── Organizations ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgRows } = await (db as any)
    .from('organizations')
    .select('id, name, slug')
    .order('name', { ascending: true })
  const orgs = (orgRows ?? []) as { id: string; name: string; slug: string }[]

  // ── Reconsent threshold (latest published privacy-policy requiring reconsent) ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: versions } = await (db as any)
    .from('legal_document_versions')
    .select('version, published_at, requires_reconsent, document:legal_documents!legal_document_versions_document_id_fkey(slug)')
    .eq('requires_reconsent', true)
    .order('published_at', { ascending: false })
    .limit(50)
  const reconsentVer = (versions ?? []).find(
    (v: { document: { slug: string } | null }) => v.document?.slug === 'privacy-policy'
  ) as { version: string; published_at: string } | undefined
  const threshold = reconsentVer ? new Date(reconsentVer.published_at) : null

  // ── Consent ledger (paged to be safe with large tables) ──────────────────────
  const records: ConsentRecord[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (db as any)
      .from('player_consents')
      .select('organization_id, user_id, consent_type, consent_given, withdrawn_at, consented_at')
      .order('consented_at', { ascending: false })
      .range(from, from + PAGE - 1)
    const rows = (page ?? []) as ConsentRecord[]
    records.push(...rows)
    if (rows.length < PAGE) break
  }

  // ── Per-org aggregation ──────────────────────────────────────────────────────
  type Acc = {
    tracked: Set<string>
    privacy: Set<string>
    waiver: Set<string>
    // latest-row tracking per (user|type)
    latestSeen: Set<string>
    marketingEmail: Set<string>
    marketingSms: Set<string>
    latestPrivacyAt: Map<string, string> // user -> latest privacy consented_at
  }
  const acc = new Map<string, Acc>()
  const blank = (): Acc => ({
    tracked: new Set(), privacy: new Set(), waiver: new Set(),
    latestSeen: new Set(), marketingEmail: new Set(), marketingSms: new Set(),
    latestPrivacyAt: new Map(),
  })

  // records are ordered newest-first → first row per (user|type) is the latest
  for (const r of records) {
    let a = acc.get(r.organization_id)
    if (!a) { a = blank(); acc.set(r.organization_id, a) }
    a.tracked.add(r.user_id)

    if (r.consent_type === 'privacy_policy') {
      if (r.consent_given) a.privacy.add(r.user_id)
      if (!a.latestPrivacyAt.has(r.user_id)) a.latestPrivacyAt.set(r.user_id, r.consented_at)
    } else if (r.consent_type === 'waiver') {
      if (r.consent_given) a.waiver.add(r.user_id)
    } else if (r.consent_type === 'marketing_email' || r.consent_type === 'marketing_sms') {
      const key = `${r.user_id}:${r.consent_type}`
      if (!a.latestSeen.has(key)) {
        a.latestSeen.add(key)
        if (r.consent_given && !r.withdrawn_at) {
          if (r.consent_type === 'marketing_email') a.marketingEmail.add(r.user_id)
          else a.marketingSms.add(r.user_id)
        }
      }
    }
  }

  const orgRowsOut: OrgComplianceRow[] = orgs.map((o) => {
    const a = acc.get(o.id)
    let pending = 0
    if (a && threshold) {
      for (const uid of a.tracked) {
        const last = a.latestPrivacyAt.get(uid)
        if (!last || new Date(last) < threshold) pending++
      }
    }
    return {
      orgId: o.id,
      orgName: o.name,
      slug: o.slug,
      trackedPlayers: a?.tracked.size ?? 0,
      privacyConsents: a?.privacy.size ?? 0,
      waiverConsents: a?.waiver.size ?? 0,
      marketingEmail: a?.marketingEmail.size ?? 0,
      marketingSms: a?.marketingSms.size ?? 0,
      pendingReconsent: pending,
    }
  })

  const totals = orgRowsOut.reduce(
    (t, r) => ({
      orgs: t.orgs,
      consentRecords: t.consentRecords,
      trackedPlayers: t.trackedPlayers + r.trackedPlayers,
      privacyConsents: t.privacyConsents + r.privacyConsents,
      waiverConsents: t.waiverConsents + r.waiverConsents,
      marketingEmail: t.marketingEmail + r.marketingEmail,
      marketingSms: t.marketingSms + r.marketingSms,
      pendingReconsent: t.pendingReconsent + r.pendingReconsent,
    }),
    {
      orgs: orgs.length,
      consentRecords: records.length,
      trackedPlayers: 0, privacyConsents: 0, waiverConsents: 0,
      marketingEmail: 0, marketingSms: 0, pendingReconsent: 0,
    }
  )

  return {
    reconsentThreshold: reconsentVer?.published_at ?? null,
    reconsentVersion: reconsentVer?.version ?? null,
    totals,
    orgs: orgRowsOut,
  }
}
