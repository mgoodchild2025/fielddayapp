import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { ComposeMessageForm } from './compose-form'
import { DeleteAnnouncementButton } from './delete-button'

export default async function AdminMessagesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()
  const canSms = await canAccess(org.id, 'sms_notifications')

  // Load leagues, teams, and players for audience selection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: leagues }, { data: teamsRaw }, { data: membersRaw }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('leagues')
      .select('id, name')
      .eq('organization_id', org.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('teams')
      .select('id, name, league_id, league:leagues!teams_league_id_fkey(name)')
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('org_members')
      .select('user_id, profile:profiles!org_members_user_id_fkey(full_name, email)')
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .not('user_id', 'is', null),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = ((teamsRaw ?? []) as any[]).map((t) => {
    const league = Array.isArray(t.league) ? t.league[0] : t.league
    return {
      id: t.id as string,
      name: t.name as string,
      leagueId: (t.league_id as string) ?? null,
      leagueName: (league?.name as string) ?? null,
    }
  })

  // Build a deduplicated player list (an org member appears once)
  const playerMap = new Map<string, { userId: string; name: string; email: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (membersRaw ?? []) as any[]) {
    if (!m.user_id || playerMap.has(m.user_id)) continue
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
    playerMap.set(m.user_id, {
      userId: m.user_id,
      name: p?.full_name ?? p?.email ?? 'Unknown',
      email: p?.email ?? '',
    })
  }
  const players = [...playerMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  type AnnouncementRow = {
    id: string
    title: string
    body: string
    audience_type: string
    created_at: string
    sent_at: string | null
    recipient_user_ids: string[] | null
    league: { name: string } | { name: string }[] | null
    team: { name: string } | { name: string }[] | null
    sender: { full_name: string } | { full_name: string }[] | null
  }

  // Load recent announcements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: announcements } = await (db as any)
    .from('announcements')
    .select(`
      id, title, body, audience_type, created_at, sent_at, recipient_user_ids,
      league:leagues!announcements_league_id_fkey(name),
      team:teams!announcements_team_id_fkey(name),
      sender:profiles!announcements_sent_by_fkey(full_name)
    `)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(50) as { data: AnnouncementRow[] | null }

  const audienceLabel = (a: AnnouncementRow) => {
    if (a.audience_type === 'org') return 'All Members'
    if (a.audience_type === 'league') {
      const league = Array.isArray(a.league) ? a.league[0] : a.league
      return league ? `League: ${league.name}` : 'League'
    }
    if (a.audience_type === 'team') {
      const team = Array.isArray(a.team) ? a.team[0] : a.team
      return team ? `Team: ${team.name}` : 'Team'
    }
    if (a.audience_type === 'players') {
      const n = a.recipient_user_ids?.length ?? 0
      return `${n} player${n !== 1 ? 's' : ''}`
    }
    return a.audience_type
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Messages & Announcements</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send announcements to your entire org, a specific league or team, or individual players.
        </p>
      </div>

      {/* Compose */}
      <div className="bg-white rounded-lg border p-6 mb-8">
        <h2 className="text-base font-semibold mb-4">Compose Announcement</h2>
        <ComposeMessageForm leagues={leagues ?? []} teams={teams} players={players} canSms={canSms} />
      </div>

      {/* History */}
      <h2 className="text-base font-semibold mb-3">Recent Announcements</h2>
      <div className="space-y-3">
        {announcements && announcements.length > 0 ? (
          announcements.map((a) => {
            const sender = Array.isArray(a.sender) ? a.sender[0] : a.sender
            return (
              <div key={a.id} className="bg-white rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{a.title}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {audienceLabel(a)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{a.body}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      Sent by {sender?.full_name ?? 'Unknown'} ·{' '}
                      {new Date(a.created_at).toLocaleDateString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <DeleteAnnouncementButton id={a.id} />
                </div>
              </div>
            )
          })
        ) : (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No announcements sent yet.
          </div>
        )}
      </div>
    </div>
  )
}
