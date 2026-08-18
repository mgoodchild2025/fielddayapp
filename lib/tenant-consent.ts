import { createServiceRoleClient } from '@/lib/supabase/service'

// Server-only tenant-consent write helper. Lives in lib/ (NOT an action) on
// purpose: it is called from the org-signup flow and the reacceptance action —
// exposing it as a public server action would let anyone forge acceptance rows.

/** Write one acceptance row per document in a single batch insert. Service role only. */
export async function writeAcceptanceRows({
  organizationId,
  userId,
  docs,
  acceptanceType,
  ipAddress,
  userAgent,
}: {
  organizationId: string
  userId: string
  docs: Array<{ slug: string; version: string; versionId: string | null }>
  acceptanceType: 'onboarding' | 'reacceptance' | 'manual'
  ipAddress: string | null
  userAgent: string | null
}): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()

  const rows = docs.map((doc) => ({
    organization_id: organizationId,
    accepted_by_user_id: userId,
    document_slug: doc.slug,
    document_version: doc.version,
    document_version_id: doc.versionId,
    acceptance_type: acceptanceType,
    accepted_at: new Date().toISOString(),
    ip_address: ipAddress,
    user_agent: userAgent,
    notes: null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('tenant_acceptances').insert(rows)
  return { error: error?.message ?? null }
}
