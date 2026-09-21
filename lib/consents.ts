import { createServiceRoleClient } from '@/lib/supabase/service'

// Consent ledger writes.
//
// This lives in lib/ rather than actions/ deliberately. It used to be an
// export of a 'use server' file, which made it a directly callable endpoint
// taking the organization id, user id and consent flag straight from its
// caller — anyone could forge a record saying a player had agreed to
// something. It has only ever been called server-side (registration, waiver
// signing, marketing opt-in), so moving it here removes the endpoint without
// changing a single call site's behaviour.

export type ConsentType = 'privacy_policy' | 'waiver' | 'marketing_email' | 'marketing_sms'

export interface ConsentRow {
  organization_id: string
  user_id: string
  league_id?: string | null
  consent_type: ConsentType
  consent_given: boolean
  document_slug?: string | null
  document_version?: string | null
  legal_document_version_id?: string | null
  waiver_id?: string | null
  waiver_signature_id?: string | null
  ip_address?: string | null
  user_agent?: string | null
}

export async function recordConsents(rows: ConsentRow[]): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null }
  const db = createServiceRoleClient()

  const { error } = await db.from('player_consents').insert(
    rows.map((r) => ({
      organization_id: r.organization_id,
      user_id: r.user_id,
      league_id: r.league_id ?? null,
      consent_type: r.consent_type,
      consent_given: r.consent_given,
      document_slug: r.document_slug ?? null,
      document_version: r.document_version ?? null,
      legal_document_version_id: r.legal_document_version_id ?? null,
      waiver_id: r.waiver_id ?? null,
      waiver_signature_id: r.waiver_signature_id ?? null,
      ip_address: r.ip_address ?? null,
      user_agent: r.user_agent ?? null,
    }))
  )
  return { error: error?.message ?? null }
}
