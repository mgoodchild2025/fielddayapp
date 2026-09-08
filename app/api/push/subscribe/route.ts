import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { parseSubscription, upsertPushSubscription } from '@/lib/push'

/**
 * Same as actions/push.ts#savePushSubscription, reachable from the service
 * worker's `pushsubscriptionchange` handler (workers can't call Server
 * Actions). Cookie-authenticated like any page request.
 */
export async function POST(request: Request) {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { subscription?: unknown; userAgent?: unknown } = {}
  try { body = await request.json() } catch { /* fall through to validation */ }
  const sub = parseSubscription(body.subscription)
  if (!sub) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })

  const ua = typeof body.userAgent === 'string' ? body.userAgent : null
  const { error } = await upsertPushSubscription(user.id, org.id, sub, ua)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
