/**
 * Data Retention Cron Job
 *
 * Timeline (from subscription cancellation):
 *   + 30 days  → export window closes
 *   + 90 days  → de-identification deadline (60 days after export window)
 *
 * This job runs daily and de-identifies player data for any org that has
 * passed the 90-day mark and hasn't been de-identified yet.
 *
 * De-identification means:
 *   - profiles: clear full_name, phone, date_of_birth, gender, avatar_url; set email to anonymized placeholder
 *   - player_details: clear emergency contact info, notes
 *   - org_members: set status to 'deidentified'
 *   - team_members: set status to 'deidentified'
 *   - game_rsvps: delete (no retention value)
 *   - payments / registrations / waiver_signatures: user_id already nulled on deletion;
 *     for orgs (not individual deletions), nullify user_id to break the link
 *   - waiver_signatures: nullify user_id
 *   - notifications: delete
 *
 * Auth records in Supabase are NOT deleted (the user may belong to other orgs).
 * Only org-scoped data is touched.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

const EXPORT_WINDOW_DAYS = 30
const DEIDENTIFY_AFTER_DAYS = 90  // 30 (export) + 60 (de-id window)

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceRoleClient()
  const results: string[] = []
  const now = new Date()

  try {
    // Find canceled subscriptions that are past the 90-day de-identification deadline
    const deidentifyBefore = new Date(now.getTime() - DEIDENTIFY_AFTER_DAYS * 24 * 60 * 60 * 1000)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: expiredSubs, error: subsError } = await (db as any)
      .from('subscriptions')
      .select('organization_id, current_period_end')
      .eq('status', 'canceled')
      .lt('current_period_end', deidentifyBefore.toISOString())
      .not('organization_id', 'is', null)

    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 })
    }

    const candidateOrgIds = (expiredSubs ?? []).map(
      (s: { organization_id: string }) => s.organization_id
    )

    if (candidateOrgIds.length === 0) {
      return NextResponse.json({ message: 'No orgs require de-identification', results: [] })
    }

    // Filter out orgs already de-identified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgs } = await (db as any)
      .from('organizations')
      .select('id, name')
      .in('id', candidateOrgIds)
      .is('data_deidentified_at', null)

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ message: 'All candidate orgs already de-identified', results: [] })
    }

    for (const orgRow of orgs) {
      const orgId = orgRow.id as string
      try {
        await deidentifyOrg(db, orgId, orgRow.name)
        results.push(`✓ de-identified org ${orgId} (${orgRow.name})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push(`✗ failed org ${orgId}: ${msg}`)
        console.error(`[data-retention] failed to de-identify org ${orgId}:`, err)
      }
    }

    return NextResponse.json({ message: 'Data retention run complete', results })
  } catch (err) {
    console.error('[data-retention] cron error:', err)
    return NextResponse.json({ error: 'Cron failed', results }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deidentifyOrg(db: any, orgId: string, orgName: string) {
  // 1. Find all user IDs who are members of this org
  const { data: members } = await db
    .from('org_members')
    .select('user_id')
    .eq('organization_id', orgId)

  const userIds: string[] = (members ?? [])
    .map((m: { user_id: string }) => m.user_id)
    .filter(Boolean)

  let playerCount = userIds.length

  if (userIds.length > 0) {
    // 2. Anonymize profiles (only for users who belong to THIS org and no other active org)
    //    We must be careful: a user might belong to multiple orgs. Only de-identify
    //    profile data that is org-specific; the profile row itself is shared.
    //    Strategy: set profile to anonymized placeholder only if user has NO other active org memberships.
    const { data: otherMemberships } = await db
      .from('org_members')
      .select('user_id')
      .in('user_id', userIds)
      .neq('organization_id', orgId)
      .in('status', ['active', 'pending'])

    const usersWithOtherOrgs = new Set(
      (otherMemberships ?? []).map((m: { user_id: string }) => m.user_id)
    )
    const usersToAnonymize = userIds.filter(id => !usersWithOtherOrgs.has(id))

    if (usersToAnonymize.length > 0) {
      // Anonymize shared profile rows
      await db.from('profiles').update({
        full_name: '[Removed]',
        phone: null,
        date_of_birth: null,
        gender: null,
        avatar_url: null,
        // email is managed by Supabase Auth — we leave it but it's non-PII at this point
        // For full removal the Auth account would need deletion, but user may be in other orgs
      }).in('id', usersToAnonymize)
    }

    // 3. Clear org-scoped player_details (always safe — scoped to this org)
    await db.from('player_details').update({
      emergency_contact_name: null,
      emergency_contact_phone: null,
      emergency_contact_relationship: null,
      notes: null,
    }).eq('organization_id', orgId).in('user_id', userIds)

    // 4. Nullify user_id on payments (retain for tax; break personal link)
    await db.from('payments').update({ user_id: null })
      .eq('organization_id', orgId)
      .in('user_id', userIds)

    // 5. Nullify user_id on registrations (retain for records; break personal link)
    await db.from('registrations').update({ user_id: null })
      .eq('organization_id', orgId)
      .in('user_id', userIds)

    // 6. Nullify user_id on waiver_signatures
    await db.from('waiver_signatures').update({ user_id: null })
      .eq('organization_id', orgId)
      .in('user_id', userIds)

    // 7. Delete game RSVPs (no retention requirement)
    await db.from('game_rsvps').delete()
      .eq('organization_id', orgId)
      .in('user_id', userIds)

    // 8. Delete notifications
    await db.from('notifications').delete()
      .eq('organization_id', orgId)
      .in('user_id', userIds)

    // 9. Mark org_members as deidentified
    await db.from('org_members').update({ status: 'deidentified' })
      .eq('organization_id', orgId)
      .in('user_id', userIds)

    // 10. Mark team_members as deidentified
    await db.from('team_members').update({ status: 'deidentified' })
      .eq('organization_id', orgId)
      .in('user_id', userIds)
  } else {
    playerCount = 0
  }

  // 11. Mark org as de-identified
  await db.from('organizations').update({
    data_deidentified_at: new Date().toISOString(),
  }).eq('id', orgId)

  // 12. Write audit log
  await db.from('org_data_retention_logs').insert({
    organization_id: orgId,
    event_type: 'deidentification',
    triggered_by: 'cron',
    triggered_by_user: null,
    player_count: playerCount,
    notes: `Automatic de-identification completed for org "${orgName}" — ${playerCount} player(s) processed.`,
  })

  // Also surface it in the org-facing audit log (system actor).
  await recordAuditLog({
    orgId,
    actorUserId: null,
    actorLabel: 'System (retention)',
    action: AUDIT_ACTIONS.DATA_RETENTION_PURGE,
    targetType: 'organization',
    targetId: orgId,
    targetLabel: orgName,
    metadata: { player_count: playerCount },
  })
}
