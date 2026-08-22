import type { createServiceRoleClient } from '@/lib/supabase/service'
import type { BioCardData } from '@/components/bios/player-bio-card'
import { getPlayerCareer, type PlayerCareer } from '@/lib/career'
import { getMedalCountsForUsers } from '@/lib/medal-queries'

/**
 * One loader for a complete player card (front + back) — used by the card
 * page and the team card binder. Respects hidden_by_admin: a hidden bio
 * falls back to name + avatar, exactly like the roster modal.
 */

export interface PlayerCardData {
  bio: BioCardData
  career: PlayerCareer
}

type Db = ReturnType<typeof createServiceRoleClient>

export function formatMedalShelf(counts: { gold: number; silver: number; bronze: number; tier_champion: number } | undefined): string | null {
  if (!counts) return null
  const bits = ([['gold', '🥇'], ['silver', '🥈'], ['bronze', '🥉'], ['tier_champion', '🏆']] as const)
    .map(([k, g]) => { const n = counts[k]; return n > 0 ? g.repeat(Math.min(n, 3)) + (n > 3 ? `×${n}` : '') : '' })
    .filter(Boolean)
  return bits.length > 0 ? bits.join(' ') : null
}

export async function getPlayerCardData(db: Db, orgId: string, userId: string): Promise<PlayerCardData | null> {
  const [{ data: profile }, { data: bioRow }, medalCounts, career] = await Promise.all([
    db.from('profiles').select('full_name, avatar_url').eq('id', userId).maybeSingle(),
    db.from('player_bios')
      .select('hero_photo_url, jersey_number, position, hometown, years_playing, tagline, hidden_by_admin')
      .eq('organization_id', orgId).eq('user_id', userId).maybeSingle(),
    getMedalCountsForUsers(db, orgId, [userId]),
    getPlayerCareer(db, orgId, userId),
  ])
  if (!profile) return null

  const b = bioRow && !bioRow.hidden_by_admin ? bioRow : null
  const latestSeason = career.seasons[career.seasons.length - 1]
  return {
    bio: {
      name: profile.full_name ?? 'Player',
      photoUrl: b?.hero_photo_url ?? profile.avatar_url ?? null,
      teamName: latestSeason?.teamName ?? null,
      position: b?.position ?? null,
      jerseyNumber: b?.jersey_number ?? null,
      hometown: b?.hometown ?? null,
      yearsPlaying: b?.years_playing ?? null,
      tagline: b?.tagline ?? null,
      medalShelf: formatMedalShelf(medalCounts.get(userId)),
    },
    career,
  }
}
