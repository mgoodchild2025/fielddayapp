'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'

const signWaiverSchema = z.object({
  waiverId: z.string().uuid(),
  signatureName: z.string().min(2),
})

export async function signWaiver(input: z.infer<typeof signWaiverSchema>) {
  const parsed = signWaiverSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const headersList = headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  // Check for existing signature
  const { data: existing } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('waiver_id', parsed.data.waiverId)
    .single()

  if (existing) return { data: { signatureId: existing.id }, error: null }

  const { data, error } = await supabase
    .from('waiver_signatures')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      waiver_id: parsed.data.waiverId,
      signature_name: parsed.data.signatureName,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  return { data: { signatureId: data.id }, error: null }
}
