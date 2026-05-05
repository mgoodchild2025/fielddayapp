'use server'

import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendWaiverSigningRequest } from './emails'

export async function sendWaiverReminders(leagueId: string): Promise<{ sent: number; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const db = createServiceRoleClient()

  // Fetch the league (including waiver configuration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, name, slug, waiver_version_id')
    .eq('id', leagueId)
    .eq('organization_id', org.id)
    .single()

  if (!league || !league.waiver_version_id) {
    return { sent: 0, error: 'No waiver is configured for this event.' }
  }

  // Fetch active registrations that have not yet signed the waiver
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: registrations } = await (db as any)
    .from('registrations')
    .select('id, user_id, profiles!registrations_user_id_fkey(full_name, email)')
    .eq('league_id', leagueId)
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .is('waiver_signature_id', null)

  if (!registrations || registrations.length === 0) {
    return { sent: 0, error: null }
  }

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const signUrl = `https://${org.slug}.${platformDomain}/events/${league.slug}/sign-waiver`

  let sent = 0
  for (const reg of registrations) {
    const profile = Array.isArray(reg.profiles) ? reg.profiles[0] : reg.profiles
    if (!profile?.email) continue

    try {
      await sendWaiverSigningRequest({
        email: profile.email,
        name: profile.full_name ?? 'Player',
        leagueName: league.name,
        orgName: org.name,
        signUrl,
      })
      sent++
    } catch {
      // Continue sending to remaining players even if one fails
    }
  }

  return { sent, error: null }
}
