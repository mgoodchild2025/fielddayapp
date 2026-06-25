'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/tenant'
import { createRateLimiter } from '@/lib/rate-limit'
import { sendEmailBatch, buildEventRegistrationOpenEmail } from '@/lib/email'
import { interestUnsubscribeUrl } from '@/lib/unsubscribe'

// Cap public notify-me submissions per IP (mirrors guestRegLimiter).
const interestLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 8 })

const recordSchema = z.object({
  leagueId: z.string().uuid(),
  email: z.string().trim().email('Enter a valid email').max(200),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  source: z.enum(['coming_soon', 'events_list', 'homepage']).optional(),
})

/**
 * Public, unauthenticated "notify me when registration opens" capture. Only
 * accepts signups for events that are genuinely coming soon (draft + advertised
 * + registration opens in the future). Deduped per (league, email).
 */
export async function recordEventInterest(
  input: z.infer<typeof recordSchema>
): Promise<{ error: string | null }> {
  const parsed = recordSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const h = await headers()
  const org = await getCurrentOrg(h)
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  if (interestLimiter.check(ip).limited) {
    return { error: 'Too many requests. Please wait a few minutes and try again.' }
  }

  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues')
    .select('id, organization_id, status, advertised, registration_opens_at')
    .eq('id', parsed.data.leagueId)
    .eq('organization_id', org.id)
    .maybeSingle()

  const opensInFuture =
    !league?.registration_opens_at || new Date(league.registration_opens_at) > new Date()
  if (!league || league.status !== 'draft' || !league.advertised || !opensInFuture) {
    return { error: 'This event is not accepting notifications right now.' }
  }

  // Attach the user id if they happen to be logged in (optional).
  let userId: string | null = null
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    userId = null
  }

  const email = parsed.data.email.toLowerCase()
  const name = parsed.data.name?.trim() || null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('event_interest').insert({
    organization_id: org.id,
    league_id: league.id,
    email,
    name,
    user_id: userId,
    source: parsed.data.source ?? 'coming_soon',
  })

  if (error) {
    // Unique violation → already on the list. Treat as success and clear any
    // prior unsubscribe so re-signing-up re-subscribes them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code === '23505') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('event_interest')
        .update({ unsubscribed_at: null })
        .eq('league_id', league.id)
        .eq('email', email)
      return { error: null }
    }
    return { error: 'Could not add you to the list. Please try again.' }
  }

  return { error: null }
}

/** One-click unsubscribe from an event's notify-me list (signed token gate). */
export async function unsubscribeInterest(interestId: string): Promise<{ error: string | null }> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('event_interest')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', interestId)
  return { error: null }
}

/**
 * Email everyone on an event's interest list that registration is now open.
 * Called when an admin moves the event into registration_open. One-shot per
 * recipient (notified_at gate). Email-only (interest list captures no phone).
 * Never throws — callers wrap in .catch().
 */
export async function notifyInterestList(leagueId: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (db as any)
    .from('event_interest')
    .select('id, email')
    .eq('league_id', leagueId)
    .is('notified_at', null)
    .is('unsubscribed_at', null)

  const recipients = (rows ?? []) as { id: string; email: string }[]
  if (recipients.length === 0) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: league } = await (db as any)
    .from('leagues').select('name, slug, season_start_date').eq('id', leagueId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (db as any)
    .from('organizations').select('name, slug').eq('id', orgId).maybeSingle()
  if (!league || !org) return

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const origin = `https://${org.slug}.${platformDomain}`
  const registerUrl = `${origin}/events/${league.slug}`
  const startLine = league.season_start_date
    ? `Starts ${new Date(league.season_start_date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
    : null

  const emails = recipients.map((r) => ({
    to: r.email,
    subject: `Registration is open — ${league.name}`,
    html: buildEventRegistrationOpenEmail({
      orgName: org.name,
      leagueName: league.name,
      registerUrl,
      unsubscribeUrl: interestUnsubscribeUrl(origin, r.id),
      startLine,
    }),
  }))

  await sendEmailBatch(emails)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('event_interest')
    .update({ notified_at: new Date().toISOString() })
    .in('id', recipients.map((r) => r.id))
}
