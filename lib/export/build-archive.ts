import { zipSync, type Zippable } from 'fflate'
import { toCsvBytes, toJsonBytes, toTextBytes, sha256Hex } from './csv-helpers'
import {
  fetchOrgProfile,
  fetchLeagues,
  fetchPools,
  fetchTeams,
  fetchTeamMembers,
  fetchAllOrgUserIds,
  fetchPlayers,
  fetchPlayersFromAuth,
  fetchOrgMembers,
  fetchRegistrations,
  fetchGames,
  fetchGameResults,
  fetchPlayerStats,
  fetchWaivers,
  fetchWaiverSignatures,
  fetchPayments,
  fetchOrgPhotos,
} from './queries'

const EXPORT_VERSION = '1.0'
const PLATFORM_VERSION = '1.0.0'

/** Derive a file extension from a Content-Type header value. */
function extFromContentType(ct: string): string | null {
  const type = ct.split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
  }
  return map[type] ?? null
}

/** Derive a file extension from a URL path as a fallback. */
function extFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const dot = pathname.lastIndexOf('.')
    if (dot === -1) return null
    const ext = pathname.slice(dot + 1).toLowerCase().split('?')[0]
    return ext.length > 0 && ext.length <= 5 ? ext : null
  } catch {
    return null
  }
}

interface ManifestFile {
  path: string
  rows: number
  size_bytes: number
  sha256: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildArchive(db: any, orgId: string, requestedByEmail: string): Promise<Uint8Array> {
  // ── 1. Fetch all data ─────────────────────────────────────────────────────
  const { org, branding, subscription } = await fetchOrgProfile(db, orgId)

  const [leagues, teams, orgMembers, registrations, games, gameResults, playerStats, waivers, waiverSignatures, payments, photos] = await Promise.all([
    fetchLeagues(db, orgId),
    fetchTeams(db, orgId),
    fetchOrgMembers(db, orgId),
    fetchRegistrations(db, orgId),
    fetchGames(db, orgId),
    fetchGameResults(db, orgId),
    fetchPlayerStats(db, orgId),
    fetchWaivers(db, orgId),
    fetchWaiverSignatures(db, orgId),
    fetchPayments(db, orgId),
    fetchOrgPhotos(db, orgId),
  ])

  const leagueIds = leagues.map((l: { id: string }) => l.id)
  const pools = await fetchPools(db, orgId, leagueIds)

  // Collect all user IDs across the org
  const userIds = await fetchAllOrgUserIds(db, orgId)

  // Fetch profiles + auth fallback
  const [profileRows, authUsers] = await Promise.all([
    fetchPlayers(db, orgId, userIds),
    fetchPlayersFromAuth(db, userIds),
  ])

  // Merge: profiles row wins; fall back to auth user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileMap = new Map<string, any>()
  for (const p of profileRows) profileMap.set(p.id, p)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authMap = new Map<string, any>()
  for (const u of authUsers) authMap.set(u.id, u)

  // ── 2. Build files ───────────────────────────────────────────────────────

  const now = new Date()
  const generatedAt = now.toISOString()
  const files: Zippable = {}
  const manifestFiles: ManifestFile[] = []

  async function addFile(path: string, bytes: Uint8Array, rowCount: number) {
    files[path] = bytes
    manifestFiles.push({
      path,
      rows: rowCount,
      size_bytes: bytes.length,
      sha256: await sha256Hex(bytes),
    })
  }

  // ── organization.json ─────────────────────────────────────────────────────
  const orgJson = {
    id: org?.id,
    name: org?.name,
    slug: org?.slug,
    created_at: org?.created_at,
    primary_contact: {
      name: branding?.contact_name ?? null,
      email: branding?.contact_email ?? null,
      phone: branding?.contact_phone ?? null,
    },
    branding: {
      primary_color: branding?.primary_color ?? null,
      secondary_color: branding?.secondary_color ?? null,
      logo_url: branding?.logo_url ?? null,
    },
    settings: {
      timezone: branding?.timezone ?? 'America/Toronto',
      default_sport: null,
    },
    billing: {
      plan: subscription?.plan_tier ?? null,
      status: subscription?.status ?? null,
    },
  }
  await addFile('organization.json', toJsonBytes(orgJson), 1)

  // ── leagues/leagues.csv ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaguesCsv = leagues.map((l: any) => ({
    league_id: l.id,
    name: l.name,
    sport: l.sport ?? '',
    description: l.description ?? '',
    event_type: l.event_type ?? '',
    status: l.status ?? '',
    max_teams: l.max_teams ?? '',
    max_participants: l.max_participants ?? '',
    registration_opens_at: l.registration_opens_at ?? '',
    registration_closes_at: l.registration_closes_at ?? '',
    start_date: l.season_start_date ?? '',
    end_date: l.season_end_date ?? '',
    slug: l.slug ?? '',
    created_at: l.created_at ?? '',
    updated_at: l.updated_at ?? '',
  }))
  await addFile('leagues/leagues.csv', toCsvBytes(leaguesCsv, ['league_id','name','sport','description','event_type','status','max_teams','max_participants','registration_opens_at','registration_closes_at','start_date','end_date','slug','created_at','updated_at']), leaguesCsv.length)

  // ── leagues/divisions.csv (pools) ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const divisionsCsv = pools.map((p: any) => ({
    division_id: p.id,
    league_id: p.league_id,
    name: p.name ?? '',
    sort_order: p.sort_order ?? 0,
    created_at: p.created_at ?? '',
  }))
  await addFile('leagues/divisions.csv', toCsvBytes(divisionsCsv, ['division_id','league_id','name','sort_order','created_at']), divisionsCsv.length)

  // ── teams/teams.csv ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamsCsv = teams.map((t: any) => ({
    team_id: t.id,
    league_id: t.league_id ?? '',
    division_id: t.pool_id ?? '',
    name: t.name ?? '',
    color: t.color ?? '',
    logo_url: t.logo_url ?? '',
    created_at: t.created_at ?? '',
  }))
  await addFile('teams/teams.csv', toCsvBytes(teamsCsv, ['team_id','league_id','division_id','name','color','logo_url','created_at']), teamsCsv.length)

  // ── teams/rosters.csv ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rostersCsv = (await fetchTeamMembers(db, orgId)).map((tm: any) => ({
    roster_id: tm.id,
    team_id: tm.team_id ?? '',
    player_id: tm.user_id ?? '',
    role: tm.role ?? '',
    status: tm.status ?? '',
    jersey_number: tm.jersey_number ?? '',
    joined_at: tm.created_at ?? '',
    left_at: tm.left_at ?? '',
  }))
  await addFile('teams/rosters.csv', toCsvBytes(rostersCsv, ['roster_id','team_id','player_id','role','status','jersey_number','joined_at','left_at']), rostersCsv.length)

  // ── players/players.csv ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playersCsv = userIds.map((uid) => {
    const p = profileMap.get(uid)
    const a = authMap.get(uid)
    const fullName: string = p?.full_name ?? a?.user_metadata?.full_name ?? ''
    const nameParts = fullName.split(' ')
    const firstName = nameParts[0] ?? ''
    const lastName = nameParts.slice(1).join(' ')
    return {
      player_id: uid,
      first_name: firstName,
      last_name: lastName,
      email: p?.email ?? a?.email ?? '',
      phone: p?.phone ?? a?.phone ?? '',
      status: 'active',
      created_at: p?.created_at ?? a?.created_at ?? '',
      updated_at: p?.updated_at ?? '',
    }
  })
  await addFile('players/players.csv', toCsvBytes(playersCsv, ['player_id','first_name','last_name','email','phone','status','created_at','updated_at']), playersCsv.length)

  // ── players/participation-history.csv ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participationCsv = registrations.map((r: any) => ({
    participation_id: r.id,
    player_id: r.user_id ?? '',
    league_id: r.league_id ?? '',
    status: r.status ?? '',
    amount_paid_cents: r.amount_paid_cents ?? 0,
    registered_at: r.created_at ?? '',
  }))
  await addFile('players/participation-history.csv', toCsvBytes(participationCsv, ['participation_id','player_id','league_id','status','amount_paid_cents','registered_at']), participationCsv.length)

  // ── players/player-consents.csv (waiver signatures) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consentsCsv = waiverSignatures.map((ws: any) => ({
    consent_id: ws.id,
    player_id: ws.user_id ?? '',
    waiver_id: ws.waiver_id ?? '',
    consent_type: 'waiver',
    consent_given: true,
    signed_at: ws.signed_at ?? '',
    ip_address: ws.ip_address ?? '',
    league_id: ws.league_id ?? '',
  }))
  await addFile('players/player-consents.csv', toCsvBytes(consentsCsv, ['consent_id','player_id','waiver_id','consent_type','consent_given','signed_at','ip_address','league_id']), consentsCsv.length)

  // ── games/games.csv ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gamesCsv = games.map((g: any) => ({
    game_id: g.id,
    league_id: g.league_id ?? '',
    home_team_id: g.home_team_id ?? '',
    away_team_id: g.away_team_id ?? '',
    home_team_label: g.home_team_label ?? '',
    away_team_label: g.away_team_label ?? '',
    scheduled_at: g.scheduled_at ?? '',
    court: g.court ?? '',
    week_number: g.week_number ?? '',
    status: g.status ?? '',
    cancellation_reason: g.cancellation_reason ?? '',
    created_at: g.created_at ?? '',
  }))
  await addFile('games/games.csv', toCsvBytes(gamesCsv, ['game_id','league_id','home_team_id','away_team_id','home_team_label','away_team_label','scheduled_at','court','week_number','status','cancellation_reason','created_at']), gamesCsv.length)

  // ── games/game-results.csv ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultsCsv = gameResults.map((r: any) => ({
    result_id: r.id,
    game_id: r.game_id ?? '',
    home_score: r.home_score ?? '',
    away_score: r.away_score ?? '',
    sets: r.sets ? JSON.stringify(r.sets) : '',
    status: r.status ?? '',
    recorded_by: r.recorded_by ?? '',
    recorded_at: r.recorded_at ?? '',
    confirmed_by: r.confirmed_by ?? '',
    confirmed_at: r.confirmed_at ?? '',
  }))
  await addFile('games/game-results.csv', toCsvBytes(resultsCsv, ['result_id','game_id','home_score','away_score','sets','status','recorded_by','recorded_at','confirmed_by','confirmed_at']), resultsCsv.length)

  // ── games/player-stats.csv ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsCsv = playerStats.map((s: any) => ({
    stat_id: s.id,
    game_id: s.game_id ?? '',
    player_id: s.user_id ?? '',
    team_id: s.team_id ?? '',
    stat_name: s.stat_key ?? '',
    stat_value: s.value ?? '',
    recorded_at: s.created_at ?? '',
  }))
  await addFile('games/player-stats.csv', toCsvBytes(statsCsv, ['stat_id','game_id','player_id','team_id','stat_name','stat_value','recorded_at']), statsCsv.length)

  // ── games/standings.csv ───────────────────────────────────────────────────
  // Compute standings from game results per league
  const standingsCsv = computeStandings(games, gameResults, now.toISOString().slice(0, 10))
  await addFile('games/standings.csv', toCsvBytes(standingsCsv, ['standing_id','league_id','team_id','as_of_date','games_played','wins','losses','ties','points','ranking']), standingsCsv.length)

  // ── financial/transactions.csv ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactionsCsv = payments.map((p: any) => ({
    transaction_id: p.id,
    player_id: p.user_id ?? '',
    league_id: p.league_id ?? '',
    team_id: p.team_id ?? '',
    description: p.description ?? '',
    amount_cents: p.amount_cents ?? 0,
    currency: p.currency ?? 'CAD',
    status: p.status ?? '',
    processor: 'stripe',
    processor_reference: p.stripe_payment_intent_id ?? '',
    created_at: p.created_at ?? '',
    refunded_at: p.refunded_at ?? '',
  }))
  await addFile('financial/transactions.csv', toCsvBytes(transactionsCsv, ['transaction_id','player_id','league_id','team_id','description','amount_cents','currency','status','processor','processor_reference','created_at','refunded_at']), transactionsCsv.length)

  // ── waivers/waivers.csv ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const waiversCsv = waivers.map((w: any) => ({
    waiver_id: w.id,
    title: w.title ?? '',
    version: w.version ?? '',
    is_active: w.is_active ?? false,
    created_at: w.created_at ?? '',
  }))
  await addFile('waivers/waivers.csv', toCsvBytes(waiversCsv, ['waiver_id','title','version','is_active','created_at']), waiversCsv.length)

  // ── media/ — download actual image files ─────────────────────────────────
  // Each entry in media-index.csv also has a local_path so the archive is
  // self-contained and the CSV can serve as a manifest for the included files.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mediaIndexRows: any[] = []

  // Helper: download a URL, add to ZIP, return the zip path (or null on failure)
  async function downloadMedia(url: string, zipDir: string, basename: string): Promise<string | null> {
    if (!url) return null
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) return null
      const contentType = res.headers.get('content-type') ?? ''
      const ext = extFromContentType(contentType) ?? extFromUrl(url) ?? 'bin'
      const zipPath = `${zipDir}/${basename}.${ext}`
      const bytes = new Uint8Array(await res.arrayBuffer())
      files[zipPath] = bytes
      return zipPath
    } catch {
      return null
    }
  }

  // Org logo
  if (branding?.logo_url) {
    const localPath = await downloadMedia(branding.logo_url, 'media', 'org-logo')
    mediaIndexRows.push({
      media_id: 'org-logo',
      entity_type: 'org_logo',
      entity_id: orgId,
      url: branding.logo_url,
      local_path: localPath ?? '',
      caption: '',
      display_order: 0,
      uploaded_at: '',
    })
  }

  // Team logos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of teams as any[]) {
    if (!t.logo_url) continue
    const localPath = await downloadMedia(t.logo_url, 'media/team-logos', t.id)
    mediaIndexRows.push({
      media_id: t.id,
      entity_type: 'team_logo',
      entity_id: t.id,
      url: t.logo_url,
      local_path: localPath ?? '',
      caption: t.name ?? '',
      display_order: 0,
      uploaded_at: t.created_at ?? '',
    })
  }

  // Org gallery photos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of photos as any[]) {
    if (!p.url) continue
    const localPath = await downloadMedia(p.url, 'media/photos', p.id)
    mediaIndexRows.push({
      media_id: p.id,
      entity_type: 'org_photo',
      entity_id: orgId,
      url: p.url,
      local_path: localPath ?? '',
      caption: p.caption ?? '',
      display_order: p.display_order ?? 0,
      uploaded_at: p.created_at ?? '',
    })
  }

  await addFile('media/media-index.csv', toCsvBytes(mediaIndexRows, ['media_id','entity_type','entity_id','url','local_path','caption','display_order','uploaded_at']), mediaIndexRows.length)

  // ── manifest.json ─────────────────────────────────────────────────────────
  const totalRecords = manifestFiles.reduce((sum, f) => sum + f.rows, 0)
  const totalBytes = manifestFiles.reduce((sum, f) => sum + f.size_bytes, 0)

  const manifest = {
    export_version: EXPORT_VERSION,
    generated_at: generatedAt,
    fieldday_platform_version: PLATFORM_VERSION,
    tenant: {
      id: org?.id,
      name: org?.name,
      slug: org?.slug,
    },
    requested_by: {
      email: requestedByEmail,
    },
    files: manifestFiles,
    total_records: totalRecords,
    total_size_bytes: totalBytes,
  }
  const manifestBytes = toJsonBytes(manifest)
  files['manifest.json'] = manifestBytes

  // ── README.txt ────────────────────────────────────────────────────────────
  const orgTz = branding?.timezone ?? 'America/Toronto'
  const localTime = now.toLocaleString('en-CA', { timeZone: orgTz, dateStyle: 'long', timeStyle: 'short' })
  const readme = buildReadme({
    generatedAt,
    localTime,
    orgTz,
    orgName: org?.name ?? '',
    orgId,
    files: manifestFiles,
    exportVersion: EXPORT_VERSION,
  })
  files['README.txt'] = toTextBytes(readme)

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  return zipSync(files, { level: 6 })
}

// ── Standings computation ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeStandings(games: any[], gameResults: any[], asOfDate: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultByGame = new Map<string, any>()
  for (const r of gameResults) if (r.game_id) resultByGame.set(r.game_id, r)

  // Map: leagueId → teamId → stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsMap = new Map<string, Map<string, any>>()

  for (const g of games) {
    if (g.status !== 'completed' && g.status !== 'confirmed') continue
    const result = resultByGame.get(g.id)
    if (!result || result.status !== 'confirmed') continue

    const leagueId = g.league_id
    if (!leagueId) continue

    if (!statsMap.has(leagueId)) statsMap.set(leagueId, new Map())
    const leagueStats = statsMap.get(leagueId)!

    const homeId = g.home_team_id
    const awayId = g.away_team_id
    if (!homeId || !awayId) continue

    if (!leagueStats.has(homeId)) leagueStats.set(homeId, { wins: 0, losses: 0, ties: 0, games: 0, points: 0, league_id: leagueId })
    if (!leagueStats.has(awayId)) leagueStats.set(awayId, { wins: 0, losses: 0, ties: 0, games: 0, points: 0, league_id: leagueId })

    const home = leagueStats.get(homeId)!
    const away = leagueStats.get(awayId)!

    home.games++
    away.games++

    if (result.home_score > result.away_score) {
      home.wins++; home.points += 2
      away.losses++
    } else if (result.away_score > result.home_score) {
      away.wins++; away.points += 2
      home.losses++
    } else {
      home.ties++; home.points += 1
      away.ties++; away.points += 1
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  let rowId = 1
  for (const [, leagueStats] of statsMap) {
    const sorted = Array.from(leagueStats.entries())
      .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins)
    sorted.forEach(([teamId, s], idx) => {
      rows.push({
        standing_id: `computed-${rowId++}`,
        league_id: s.league_id,
        team_id: teamId,
        as_of_date: asOfDate,
        games_played: s.games,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        points: s.points,
        ranking: idx + 1,
      })
    })
  }
  return rows
}

// ── README builder ─────────────────────────────────────────────────────────────

interface ReadmeParams {
  generatedAt: string
  localTime: string
  orgTz: string
  orgName: string
  orgId: string
  files: ManifestFile[]
  exportVersion: string
}

function buildReadme(p: ReadmeParams): string {
  const fileSummary = p.files
    .map(f => `  ${f.path.padEnd(45)} ${f.rows.toLocaleString()} row${f.rows !== 1 ? 's' : ''}`)
    .join('\n')

  return `FIELDDAY DATA EXPORT
${'-'.repeat(60)}

Generated:   ${p.generatedAt} UTC
             ${p.localTime} (${p.orgTz})
Organisation: ${p.orgName}
ID:           ${p.orgId}
Export version: ${p.exportVersion}

FILES INCLUDED
${'-'.repeat(60)}
${fileSummary}

SCHEMA NOTES
${'-'.repeat(60)}
All timestamps are ISO 8601 in UTC (suffix Z).
All IDs are UUIDs.
CSV files are UTF-8 encoded with BOM for Excel compatibility.
CSV fields are comma-delimited and double-quoted.
Empty fields are blank in CSV, null in JSON.
Boolean fields are true or false (lowercase).

RELATIONSHIP SUMMARY
${'-'.repeat(60)}
leagues     - Top-level event/league records
divisions   - Pools within a league (if used)
teams       - Teams within a league
rosters     - Team membership (player ↔ team)
players     - Player identity records
participation-history - League registration records
games       - Scheduled and completed games
game-results - Scores and outcomes
player-stats - Individual player statistics (sparse)
standings   - Computed standings as of export date
transactions - Payment records (no card data)
waivers     - Waiver text versions
player-consents - Waiver signature records
media-index - References to uploaded photos and media

PRIVACY NOTICE
${'-'.repeat(60)}
This archive contains personal information about players,
including names, email addresses, and phone numbers.

By downloading this archive, the organisation administrator
acknowledges:

• The organisation is the responsible party for this personal
  information under PIPEDA (S.C. 2000, c. 5).
• The organisation must handle the exported data in accordance
  with its privacy obligations to players.
• Sharing this archive with third parties may constitute a
  disclosure of personal information requiring player consent.
• This archive should be stored securely and deleted when no
  longer needed.

For questions: privacy@fielddayapp.ca
`
}
