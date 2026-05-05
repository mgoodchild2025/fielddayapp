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
  applies_to: z.enum(['all', 'leagues', 'dropins']).default('all'),
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

  const { error } = await supabase.from('discount_codes').insert({
    organization_id: org.id,
    ...parsed.data,
    max_uses: parsed.data.max_uses ?? null,
    expires_at: parsed.data.expires_at || null,
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

  const { error } = await supabase
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

export async function validateDiscountCode(code: string, orgId: string, context: 'leagues' | 'dropins' | 'all' = 'all') {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('organization_id', orgId)
    .eq('code', code.toUpperCase().trim())
    .eq('active', true)
    .single()

  if (!data) return { valid: false, error: 'Invalid discount code' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { valid: false, error: 'This code has expired' }
  if (data.max_uses && data.use_count >= data.max_uses) return { valid: false, error: 'This code has reached its usage limit' }
  if (data.applies_to !== 'all' && data.applies_to !== context) return { valid: false, error: 'This code cannot be used here' }

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
