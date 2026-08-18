'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { requireOrgMember } from '@/lib/auth'
import type { SchedulePhase } from '@/lib/phases'

/**
 * Set (or clear, when phase is null) the phase for a single week of a league.
 * Upserts on (league_id, week_number).
 */
export async function setWeekPhase(
  leagueId: string,
  weekNumber: number,
  phase: SchedulePhase | null,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  await requireOrgMember(org, ['org_admin', 'league_admin'])

  const db = createServiceRoleClient()

  if (phase === null) {

    const { error } = await db
      .from('week_phases')
      .delete()
      .eq('league_id', leagueId)
      .eq('organization_id', org.id)
      .eq('week_number', weekNumber)
    if (error) return { error: error.message }
  } else {

    const { error } = await db
      .from('week_phases')
      .upsert(
        { organization_id: org.id, league_id: leagueId, week_number: weekNumber, phase },
        { onConflict: 'league_id,week_number' },
      )
    if (error) return { error: error.message }
  }

  revalidatePath(`/admin/events/${leagueId}/schedule`)
  return { error: null }
}
