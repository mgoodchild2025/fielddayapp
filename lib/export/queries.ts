/**
 * Database queries for tenant data export.
 * Each function returns raw rows; mapping to export schema is done in build-archive.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export async function fetchOrgProfile(db: DB, orgId: string) {
  const [{ data: org }, { data: branding }, { data: subscription }] = await Promise.all([
    db.from('organizations').select('id, name, slug, created_at').eq('id', orgId).single(),
    db.from('org_branding').select('*').eq('organization_id', orgId).single(),
    db.from('subscriptions').select('plan_tier, status').eq('organization_id', orgId).single(),
  ])
  return { org, branding, subscription }
}

export async function fetchLeagues(db: DB, orgId: string) {
  const { data, error } = await db
    .from('leagues')
    // Note: the schema uses season_start_date / season_end_date, NOT start_date / end_date
    .select('id, name, sport, description, status, event_type, created_at, updated_at, slug, max_teams, max_participants, registration_opens_at, registration_closes_at, season_start_date, season_end_date')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`fetchLeagues failed: ${error.message}`)
  return data ?? []
}

export async function fetchPools(db: DB, orgId: string, leagueIds: string[]) {
  if (leagueIds.length === 0) return []
  const { data, error } = await db
    .from('pools')
    .select('id, league_id, name, sort_order, created_at')
    .in('league_id', leagueIds)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`fetchPools failed: ${error.message}`)
  return data ?? []
}

export async function fetchTeams(db: DB, orgId: string) {
  const { data, error } = await db
    .from('teams')
    .select('id, league_id, name, color, logo_url, pool_id, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`fetchTeams failed: ${error.message}`)
  return data ?? []
}

export async function fetchTeamMembers(db: DB, orgId: string) {
  const { data, error } = await db
    .from('team_members')
    .select('id, team_id, user_id, role, status, jersey_number, created_at, left_at')
    .eq('organization_id', orgId)
    .not('user_id', 'is', null)
  if (error) throw new Error(`fetchTeamMembers failed: ${error.message}`)
  return data ?? []
}

export async function fetchPlayers(db: DB, orgId: string, userIds: string[]) {
  if (userIds.length === 0) return []
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, email, phone, created_at, updated_at, show_contact_info')
    .in('id', userIds)
  if (error) throw new Error(`fetchPlayers failed: ${error.message}`)
  return data ?? []
}

export async function fetchPlayersFromAuth(db: DB, userIds: string[]) {
  if (userIds.length === 0) return []
  // Fetch auth users for players without profiles rows
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
  const idSet = new Set(userIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.users ?? []).filter((u: any) => idSet.has(u.id))
}

export async function fetchAllOrgUserIds(db: DB, orgId: string): Promise<string[]> {
  const [
    { data: members, error: e1 },
    { data: regUsers, error: e2 },
    { data: teamUsers, error: e3 },
    { data: waiverUsers, error: e4 },
  ] = await Promise.all([
    db.from('org_members').select('user_id').eq('organization_id', orgId),
    db.from('registrations').select('user_id').eq('organization_id', orgId).not('user_id', 'is', null),
    db.from('team_members').select('user_id').eq('organization_id', orgId).not('user_id', 'is', null),
    db.from('waiver_signatures').select('user_id').eq('organization_id', orgId).not('user_id', 'is', null),
  ])
  if (e1) throw new Error(`fetchAllOrgUserIds (org_members) failed: ${e1.message}`)
  if (e2) throw new Error(`fetchAllOrgUserIds (registrations) failed: ${e2.message}`)
  if (e3) throw new Error(`fetchAllOrgUserIds (team_members) failed: ${e3.message}`)
  if (e4) throw new Error(`fetchAllOrgUserIds (waiver_signatures) failed: ${e4.message}`)
  const set = new Set<string>()
  for (const r of members ?? []) if (r.user_id) set.add(r.user_id)
  for (const r of regUsers ?? []) if (r.user_id) set.add(r.user_id)
  for (const r of teamUsers ?? []) if (r.user_id) set.add(r.user_id)
  for (const r of waiverUsers ?? []) if (r.user_id) set.add(r.user_id)
  return Array.from(set)
}

export async function fetchOrgMembers(db: DB, orgId: string) {
  const { data, error } = await db
    .from('org_members')
    .select('user_id, role, status, created_at')
    .eq('organization_id', orgId)
  if (error) throw new Error(`fetchOrgMembers failed: ${error.message}`)
  return data ?? []
}

export async function fetchRegistrations(db: DB, orgId: string) {
  const { data, error } = await db
    .from('registrations')
    .select('id, user_id, league_id, status, amount_paid_cents, created_at')
    .eq('organization_id', orgId)
    .not('user_id', 'is', null)
  if (error) throw new Error(`fetchRegistrations failed: ${error.message}`)
  return data ?? []
}

export async function fetchGames(db: DB, orgId: string) {
  const { data, error } = await db
    .from('games')
    .select('id, league_id, home_team_id, away_team_id, scheduled_at, court, week_number, status, cancellation_reason, home_team_label, away_team_label, created_at')
    .eq('organization_id', orgId)
    .order('scheduled_at', { ascending: true })
  if (error) throw new Error(`fetchGames failed: ${error.message}`)
  return data ?? []
}

export async function fetchGameResults(db: DB, orgId: string) {
  const { data, error } = await db
    .from('game_results')
    .select('id, game_id, home_score, away_score, sets, status, recorded_by, recorded_at, confirmed_by, confirmed_at')
    .eq('organization_id', orgId)
  if (error) throw new Error(`fetchGameResults failed: ${error.message}`)
  return data ?? []
}

export async function fetchPlayerStats(db: DB, orgId: string) {
  const { data, error } = await db
    .from('player_game_stats')
    .select('id, game_id, user_id, team_id, stat_key, value, created_at')
    .eq('organization_id', orgId)
  if (error) throw new Error(`fetchPlayerStats failed: ${error.message}`)
  return data ?? []
}

export async function fetchWaivers(db: DB, orgId: string) {
  const { data, error } = await db
    .from('waivers')
    .select('id, title, version, content, is_active, created_at')
    .eq('organization_id', orgId)
  if (error) throw new Error(`fetchWaivers failed: ${error.message}`)
  return data ?? []
}

export async function fetchWaiverSignatures(db: DB, orgId: string) {
  const { data, error } = await db
    .from('waiver_signatures')
    .select('id, waiver_id, user_id, signed_at, ip_address, league_id')
    .eq('organization_id', orgId)
    .not('user_id', 'is', null)
  if (error) throw new Error(`fetchWaiverSignatures failed: ${error.message}`)
  return data ?? []
}

export async function fetchPayments(db: DB, orgId: string) {
  const { data, error } = await db
    .from('payments')
    .select('id, user_id, league_id, team_id, amount_cents, currency, status, stripe_payment_intent_id, description, created_at, refunded_at')
    .eq('organization_id', orgId)
  if (error) throw new Error(`fetchPayments failed: ${error.message}`)
  return data ?? []
}

export async function fetchOrgPhotos(db: DB, orgId: string) {
  const { data, error } = await db
    .from('org_photos')
    .select('id, url, caption, display_order, created_at')
    .eq('organization_id', orgId)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`fetchOrgPhotos failed: ${error.message}`)
  return data ?? []
}
