import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { ComposeMessageForm } from './compose-form'
import { DeleteAnnouncementButton } from './delete-button'

export default async function AdminMessagesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Load leagues for audience selection
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('organization_id', org.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  type AnnouncementRow = {
    id: string
    title: string
    body: string
    audience_type: string
    created_at: string
    sent_at: string | null
    league: { name: string } | { name: string }[] | null
    sender: { full_name: string } | { full_name: string }[] | null
  }

  // Load recent announcements
  const { data: announcements } = await supabase
    .from('announcements')
    .select(`
      id, title, body, audience_type, created_at, sent_at,
      league:leagues!announcements_league_id_fkey(name),
      sender:profiles!announcements_sent_by_fkey(full_name)
    `)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(50) as { data: AnnouncementRow[] | null }

  const audienceLabel = (a: AnnouncementRow) => {
    if (a.audience_type === 'org') return 'All Members'
    const league = Array.isArray(a.league) ? a.league[0] : a.league
    if (a.audience_type === 'league' && league) return `League: ${(league as {name:string}).name}`
    return a.audience_type === 'org' ? 'All Members' : a.audience_type
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Messages & Announcements</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send announcements to your entire org, specific leagues, or teams.
        </p>
      </div>

      {/* Compose */}
      <div className="bg-white rounded-lg border p-6 mb-8">
        <h2 className="text-base font-semibold mb-4">Compose Announcement</h2>
        <ComposeMessageForm leagues={leagues ?? []} />
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
