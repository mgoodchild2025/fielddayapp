'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { isValidBirthday } from '@/lib/birthday'

const schema = z.union([
  z.object({ month: z.number().int(), day: z.number().int() }),
  z.null(),
])

/**
 * The signed-in player's own birthday (month + day, or null to remove it).
 * Writes ONLY the two birthday columns on their own profile.
 */
export async function setMyBirthday(input: { month: number; day: number } | null): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid birthday' }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }
  const v = parsed.data
  if (v && !isValidBirthday(v.month, v.day)) return { error: "That date doesn't exist." }

  const { error } = await createServiceRoleClient().from('profiles')
    .update({ birthday_month: v?.month ?? null, birthday_day: v?.day ?? null })
    .eq('id', user.id)
  if (error) return { error: "Couldn't save your birthday. Try again." }
  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { error: null }
}
