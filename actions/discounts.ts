'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { assertOrgAdmin } from '@/lib/auth'

const discountSchema = z.object({
  code: z.string().min(2).max(30).transform(s => s.toUpperCase().trim()),
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().positive(),
  max_uses: z.coerce.number().int().positive().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  applies_to: z.enum(['all', 'leagues', 'dropins', 'shop']).default('all'),
  league_id: z.string().uuid().optional().nullable(),
})

export async function createDiscount(input: z.infer<typeof discountSchema>) {
  const parsed = discountSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }
  const supabase = createServiceRoleClient()

  const { data: existing } = await supabase
    .from('discount_codes')
    .select('id')
    .eq('organization_id', org.id)
    .eq('code', parsed.data.code)
    .single()
  if (existing) return { error: `Code "${parsed.data.code}" already exists` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('discount_codes').insert({
    organization_id: org.id,
    ...parsed.data,
    max_uses: parsed.data.max_uses ?? null,
    expires_at: parsed.data.expires_at || null,
    league_id: parsed.data.league_id || null,
    use_count: 0,
    active: true,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/settings/discounts')
  return { error: null }
}

export async function updateDiscount(id: string, input: Partial<z.infer<typeof discountSchema>> & { active?: boolean }) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }
  const supabase = createServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('discount_codes')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings/discounts')
  return { error: null }
}

export async function deleteDiscount(id: string) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const auth = await assertOrgAdmin(org)
  if (auth.error) return { error: auth.error }
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('discount_codes')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings/discounts')
  return { error: null }
}

/**
 * Validate a discount code. Returns the discount if valid, or an error.
 *
 * context: the purchase context ('leagues' | 'dropins' | 'shop')
 * leagueId: when provided, codes scoped to a specific event must match it
 */
export async function validateDiscountCode(
  code: string,
  orgId: string,
  context: 'leagues' | 'dropins' | 'shop' | 'all' = 'all',
  leagueId?: string | null,
) {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('organization_id', orgId)
    .eq('code', code.toUpperCase().trim())
    .eq('active', true)
    .single()

  if (!data) return { valid: false, error: 'Invalid discount code' }
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return { valid: false, error: 'This code has expired' }
  if (data.max_uses && data.use_count >= data.max_uses)
    return { valid: false, error: 'This code has reached its usage limit' }

  // applies_to check: 'all' works everywhere; otherwise must match the context
  if (data.applies_to !== 'all' && data.applies_to !== context)
    return { valid: false, error: 'This code cannot be used here' }

  // Event-scoped codes: must be used for the specific league they were created for
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopedLeagueId = (data as any).league_id as string | null
  if (scopedLeagueId && leagueId && scopedLeagueId !== leagueId)
    return { valid: false, error: 'This code is not valid for this event' }
  if (scopedLeagueId && !leagueId)
    return { valid: false, error: 'This code is not valid here' }

  return {
    valid: true,
    error: null,
    discount: {
      id: data.id,
      code: data.code,
      type: data.type as 'percent' | 'fixed',
      value: data.value,
    },
  }
}

export async function incrementDiscountUse(discountId: string) {
  const supabase = createServiceRoleClient()
  await supabase.rpc('increment_discount_use', { discount_id: discountId })
}
