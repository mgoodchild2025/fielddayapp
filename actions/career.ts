'use server'

import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { getPlayerCareer, type PlayerCareer } from '@/lib/career'

/**
 * Career record for the card back (card flip C2), fetched lazily when a
 * roster card opens. Backs follow card visibility: any signed-in viewer who
 * can open the card sees the back — the data (teams, stats, medals) is
 * already public on team pages.
 */
export async function getCareerForUser(userId: string): Promise<{ career: PlayerCareer | null; error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { career: null, error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const career = await getPlayerCareer(db, org.id, userId)
  return { career, error: null }
}
