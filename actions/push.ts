'use server'

import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { deletePushSubscription, parseSubscription, pushConfigured, upsertPushSubscription } from '@/lib/push'

// ── Web Push subscription management (called from lib/push-client.ts) ────────

/** Null when the server has no VAPID keys — the client then hides push UI. */
export async function getVapidPublicKey(): Promise<string | null> {
  return pushConfigured() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null
}

export async function savePushSubscription(
  subscription: unknown,
  userAgent: string | null,
): Promise<{ error: string | null }> {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const sub = parseSubscription(subscription)
  if (!sub) return { error: 'Invalid subscription' }
  return upsertPushSubscription(user.id, org.id, sub, userAgent)
}

export async function removePushSubscription(endpoint: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return { error: 'Invalid endpoint' }
  await deletePushSubscription(user.id, endpoint)
  return { error: null }
}
