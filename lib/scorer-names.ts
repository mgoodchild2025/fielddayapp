import { createServiceRoleClient } from '@/lib/supabase/service'
import { scorerDisplayName, type ScorerNames } from '@/lib/score-entered-by'

/** Display names for the people who entered scores — one profiles read. */
export async function loadScorerNames(ids: Iterable<string | null | undefined>): Promise<ScorerNames> {
  const unique = [...new Set([...ids].filter((v): v is string => !!v))]
  if (unique.length === 0) return new Map()
  const db = createServiceRoleClient()
  const { data } = await db.from('profiles').select('id, full_name, email').in('id', unique)
  return new Map((data ?? []).map((p) => [p.id, scorerDisplayName(p)]))
}
