'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

// ── Data export ───────────────────────────────────────────────────────────────

export async function exportMyData(): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthorized' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // Collect everything in parallel
  const [
    { data: profile },
    { data: playerDetails },
    { data: orgMemberships },
    { data: registrations },
    { data: teamMembers },
    { data: waiverSigs },
    { data: rsvps },
    { data: payments },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('profiles')
      .select('full_name, email, phone, avatar_url, sms_opted_in, email_reminders_enabled, created_at')
      .eq('id', user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('player_details')
      .select('emergency_contact_name, emergency_contact_phone, jersey_size, pronouns, date_of_birth, notes')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members')
      .select('role, status, joined_at, organizations(name, slug)')
      .eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations')
      .select('status, created_at, leagues(name, slug, event_type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members')
      .select('role, status, joined_at, teams(name, leagues(name))')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('waiver_signatures')
      .select('signed_at, organizations(name)')
      .eq('user_id', user.id)
      .order('signed_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('game_rsvps')
      .select('status, created_at, games(scheduled_at, leagues(name))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('payments')
      .select('amount_cents, currency, status, created_at, leagues(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    subject: 'Personal data export — Fieldday',
    note: 'This file contains the personal information Fieldday holds about you, as provided under PIPEDA (Canada).',
    profile: profile ?? null,
    player_details: playerDetails ?? null,
    org_memberships: orgMemberships ?? [],
    registrations: registrations ?? [],
    team_memberships: teamMembers ?? [],
    waiver_signatures: waiverSigs ?? [],
    game_rsvps: rsvps ?? [],
    payments: payments ?? [],
  }

  return { data: exportData, error: null }
}

// ── Account deletion ──────────────────────────────────────────────────────────

export async function deleteMyAccount(
  confirmationText: string,
  reason?: string,
): Promise<{ error: string | null }> {
  if (confirmationText.trim().toUpperCase() !== 'DELETE') {
    return { error: 'Please type DELETE to confirm.' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // Write audit log before doing anything else
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('account_deletion_logs').insert({
    user_id: user.id,
    organization_id: org.id,
    reason: reason?.trim() || null,
  })

  // 1. Remove personal data and memberships
  await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('player_details').delete().eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('team_members').delete().eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('game_rsvps').delete().eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('notifications').delete().eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_members').delete().eq('user_id', user.id),
  ])

  // 2. Nullify user_id on records that must be retained for legal/financial purposes
  //    (payments, registrations, waiver_signatures — 7-year retention under Canadian tax law)
  await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('payments').update({ user_id: null }).eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('registrations').update({ user_id: null }).eq('user_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('waiver_signatures').update({ user_id: null }).eq('user_id', user.id),
  ])

  // 3. Anonymize the profile row (email uniqueness constraint — set to null via admin)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('profiles').update({
    full_name: 'Deleted User',
    email: null,
    phone: null,
    avatar_url: null,
    sms_opted_in: false,
  }).eq('id', user.id)

  // 4. Delete the Supabase auth account
  const { error: authErr } = await db.auth.admin.deleteUser(user.id)
  if (authErr) {
    // Log but don't fail — personal data is already removed
    console.error('[deleteMyAccount] auth delete error:', authErr.message)
  }

  redirect('/goodbye')
}
