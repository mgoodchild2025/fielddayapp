import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { headers } from 'next/headers'

// How long after subscription cancellation the export window stays open (days)
const EXPORT_WINDOW_DAYS = 30

export async function GET(_req: NextRequest) {
  try {
    const headersList = await headers()
    const org = await getCurrentOrg(headersList)
    const supabase = await createServerClient()
    const db = createServiceRoleClient()

    // Auth: must be logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Auth: must be org_admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (db as any)
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'org_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check subscription status — deny if past the export window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subscription } = await (db as any)
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('organization_id', org.id)
      .single()

    if (subscription?.status === 'canceled' && subscription.current_period_end) {
      const canceledAt = new Date(subscription.current_period_end)
      const windowEnd = new Date(canceledAt.getTime() + EXPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      if (new Date() > windowEnd) {
        return NextResponse.json(
          { error: 'Export window has closed. The 30-day data export period following subscription cancellation has passed.' },
          { status: 403 }
        )
      }
    }

    // Step 1: collect user IDs from ALL org-scoped tables (union approach —
    // some players may exist in registrations/team_members without an org_members row)
    const [
      { data: orgMemberRows },
      { data: registrationRows },
      { data: teamMemberRows },
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('org_members')
        .select('user_id, role, status, created_at')
        .eq('organization_id', org.id),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('registrations')
        .select('user_id')
        .eq('organization_id', org.id)
        .not('user_id', 'is', null),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('team_members')
        .select('user_id, team_id, role, status, created_at, teams(name)')
        .eq('organization_id', org.id)
        .not('user_id', 'is', null),
    ])

    // Union all user IDs
    const userIdSet = new Set<string>()
    for (const r of orgMemberRows ?? []) if (r.user_id) userIdSet.add(r.user_id)
    for (const r of registrationRows ?? []) if (r.user_id) userIdSet.add(r.user_id)
    for (const r of teamMemberRows ?? []) if (r.user_id) userIdSet.add(r.user_id)
    const userIds = Array.from(userIdSet)

    if (userIds.length === 0) {
      // No players found — return empty export
      const exportData = {
        exported_at: new Date().toISOString(),
        organization: { id: org.id, name: org.name, slug: org.slug },
        player_count: 0,
        players: [],
      }
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="fieldday-player-data-${org.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      })
    }

    // Step 2: fetch all remaining org-scoped data in parallel
    const [
      { data: profileRows },
      { data: playerDetails },
      { data: allRegistrations },
      { data: waiverSignatures },
      { data: payments },
      { data: gameRsvps },
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('profiles')
        .select('id, full_name, email, phone, date_of_birth, gender, avatar_url, created_at')
        .in('id', userIds),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('player_details')
        .select('user_id, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, jersey_size, notes, created_at')
        .eq('organization_id', org.id),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('registrations')
        .select('user_id, league_id, status, amount_paid_cents, created_at, leagues(name, sport)')
        .eq('organization_id', org.id)
        .not('user_id', 'is', null),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('waiver_signatures')
        .select('user_id, waiver_id, signed_at, waivers(title)')
        .eq('organization_id', org.id)
        .not('user_id', 'is', null),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('payments')
        .select('user_id, amount_cents, currency, status, created_at, description')
        .eq('organization_id', org.id)
        .not('user_id', 'is', null),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('game_rsvps')
        .select('user_id, game_id, status, created_at')
        .eq('organization_id', org.id)
        .not('user_id', 'is', null),
    ])

    // Build lookup maps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>()
    for (const p of profileRows ?? []) profileMap.set(p.id, p)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgMemberMap = new Map<string, any>()
    for (const m of orgMemberRows ?? []) orgMemberMap.set(m.user_id, m)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerDetailMap = new Map<string, any>()
    for (const pd of playerDetails ?? []) playerDetailMap.set(pd.user_id, pd)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamsByUser = new Map<string, any[]>()
    for (const tm of teamMemberRows ?? []) {
      const list = teamsByUser.get(tm.user_id) ?? []
      list.push(tm)
      teamsByUser.set(tm.user_id, list)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registrationsByUser = new Map<string, any[]>()
    for (const r of allRegistrations ?? []) {
      const list = registrationsByUser.get(r.user_id) ?? []
      list.push(r)
      registrationsByUser.set(r.user_id, list)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const waiversByUser = new Map<string, any[]>()
    for (const ws of waiverSignatures ?? []) {
      const list = waiversByUser.get(ws.user_id) ?? []
      list.push(ws)
      waiversByUser.set(ws.user_id, list)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentsByUser = new Map<string, any[]>()
    for (const p of payments ?? []) {
      const list = paymentsByUser.get(p.user_id) ?? []
      list.push(p)
      paymentsByUser.set(p.user_id, list)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rsvpsByUser = new Map<string, any[]>()
    for (const r of gameRsvps ?? []) {
      const list = rsvpsByUser.get(r.user_id) ?? []
      list.push(r)
      rsvpsByUser.set(r.user_id, list)
    }

    // Assemble per-player records
    const players = userIds.map((userId) => {
      const profile = profileMap.get(userId)
      const orgMembership = orgMemberMap.get(userId)
      const details = playerDetailMap.get(userId)
      return {
        user_id: userId,
        membership: orgMembership ? {
          role: orgMembership.role,
          status: orgMembership.status,
          joined_at: orgMembership.created_at,
        } : null,
        profile: profile ? {
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          date_of_birth: profile.date_of_birth,
          gender: profile.gender,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
        } : null,
        player_details: details ? {
          emergency_contact_name: details.emergency_contact_name,
          emergency_contact_phone: details.emergency_contact_phone,
          emergency_contact_relationship: details.emergency_contact_relationship,
          jersey_size: details.jersey_size,
          notes: details.notes,
        } : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registrations: (registrationsByUser.get(userId) ?? []).map((r: any) => ({
          league: r.leagues?.name,
          sport: r.leagues?.sport,
          status: r.status,
          amount_paid_cents: r.amount_paid_cents,
          registered_at: r.created_at,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        team_memberships: (teamsByUser.get(userId) ?? []).map((tm: any) => ({
          team: tm.teams?.name,
          role: tm.role,
          status: tm.status,
          joined_at: tm.created_at,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        waiver_signatures: (waiversByUser.get(userId) ?? []).map((ws: any) => ({
          waiver: ws.waivers?.title,
          signed_at: ws.signed_at,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payments: (paymentsByUser.get(userId) ?? []).map((p: any) => ({
          amount_cents: p.amount_cents,
          currency: p.currency,
          status: p.status,
          description: p.description,
          date: p.created_at,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        game_rsvps: (rsvpsByUser.get(userId) ?? []).map((r: any) => ({
          game_id: r.game_id,
          status: r.status,
          responded_at: r.created_at,
        })),
      }
    })

    // Log the export event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('org_data_retention_logs').insert({
      organization_id: org.id,
      event_type: 'export',
      triggered_by: 'admin',
      triggered_by_user: user.id,
      player_count: players.length,
      notes: `Data export via admin UI by ${user.email ?? user.id}`,
    })

    const exportData = {
      exported_at: new Date().toISOString(),
      organization: { id: org.id, name: org.name, slug: org.slug },
      player_count: players.length,
      players,
    }

    const today = new Date().toISOString().slice(0, 10)
    const filename = `fieldday-player-data-${org.slug}-${today}.json`

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[export/org-players]', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
