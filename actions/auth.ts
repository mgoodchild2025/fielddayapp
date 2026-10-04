'use server'

import type { Database } from '@/types/database'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { toE164 } from '@/lib/twilio'
import { z } from 'zod'
import { optionalPhone } from '@/lib/validation'
import { createRateLimiter } from '@/lib/rate-limit'
import { safeRelativePath } from '@/lib/safe-redirect'

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

// Credential endpoints are brute-force / spam targets — rate-limit by IP.
// The per-account limiter (ip+email) stops targeted password guessing while
// the looser per-IP cap still allows shared NATs (gyms, offices) to sign in.
const loginAccountLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 5 })
const loginIpLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 })
const signUpLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 5 })

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
}

/** Returns true for internal/loopback addresses that should never appear in emails. */
function isInternalHost(host: string): boolean {
  return (
    host.startsWith('0.0.0.0') ||
    host.startsWith('127.') ||
    host === 'localhost' ||
    host.startsWith('localhost:')
  )
}

/**
 * Derive the public-facing origin for auth email links.
 *
 * Priority:
 * 1. `referer` header — browser always sets this to the page URL on form submit,
 *    giving the real public domain (org subdomain, custom domain, etc.).
 * 2. `x-forwarded-host` — set by Vercel / CDN edge to the original hostname.
 * 3. `NEXT_PUBLIC_PLATFORM_DOMAIN` env var — explicit, always-correct fallback.
 *
 * Any candidate that resolves to an internal address (0.0.0.0, 127.x, localhost)
 * is rejected so it never ends up in a confirmation email.
 */
function getPublicOrigin(headersList: Awaited<ReturnType<typeof headers>>): string {
  const isDev = process.env.NODE_ENV === 'development'

  // 1. Referer (most reliable for browser-initiated server actions)
  const referer = headersList.get('referer')
  if (referer) {
    try {
      const u = new URL(referer)
      if (isDev || !isInternalHost(u.hostname)) {
        return u.origin
      }
    } catch { /* fall through */ }
  }

  // 2. x-forwarded-host (Vercel edge sets this to the real public hostname)
  const fwdHost = headersList.get('x-forwarded-host')
  if (fwdHost && (isDev || !isInternalHost(fwdHost))) {
    const proto = headersList.get('x-forwarded-proto') ?? 'https'
    return `${proto}://${fwdHost}`
  }

  // 3. Explicit fallback: use the app subdomain so password-reset links land on
  //    a page that has the auth/callback route, not the marketing site.
  if (isDev) return 'http://localhost:3000'
  return `https://app.${PLATFORM_DOMAIN}`
}

const loginSchema = z.object({
  email: z.string().email(),
  // Not a length rule: accounts with older, shorter passwords must still sign in.
  password: z.string().min(1),
})

export async function login(input: { email: string; password: string; redirectTo?: string }) {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const ip = await clientIp()
  if (
    loginAccountLimiter.check(`${ip}:${parsed.data.email.toLowerCase()}`).limited ||
    loginIpLimiter.check(ip).limited
  ) {
    return { data: null, error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Plain words for the two answers people actually hit.
    const code = (error as { code?: string }).code
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) {
      return { data: null, error: 'Please confirm your email first — tap the link we sent when you signed up (check spam too).' }
    }
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) {
      return { data: null, error: "That email and password don't match. Check them, or use “Forgot password?”." }
    }
    return { data: null, error: error.message }
  }

  revalidatePath('/', 'layout')
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  // Only allow relative paths to prevent open redirect
  const safeRedirect = safeRelativePath(input.redirectTo) ?? '/dashboard'

  let destination: string
  if (orgId) {
    // Org-subdomain login — stay on that org's domain
    destination = safeRedirect
  } else {
    // Platform-domain login (fielddayapp.ca) — route based on who the user is
    const { data: { user } } = await supabase.auth.getUser()
    const service = createServiceRoleClient()

    // Platform admins → super console
    const { data: profile } = await service
      .from('profiles').select('platform_role').eq('id', user!.id).single()
    if (profile?.platform_role === 'platform_admin') {
      destination = '/super'
    } else {
      // Route org admins / members to their org(s); players with no org get a friendly page
      destination = '/choose-org'
    }
  }

  // If the user has a TOTP factor enrolled, redirect to MFA verification
  // before granting access — applies to ALL roles (players, admins, platform admins).
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
    redirect(`/mfa/verify?redirect=${encodeURIComponent(destination)}`)
  }

  redirect(destination)
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be 100 characters or fewer'),
})

export async function signUp(input: { email: string; password: string; fullName: string; redirectTo?: string }) {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  if (signUpLimiter.check(await clientIp()).limited) {
    return { data: null, error: 'Too many sign-up attempts. Please wait a few minutes and try again.' }
  }

  const headersList = await headers()
  const origin = getPublicOrigin(headersList) // real public domain (org subdomain, etc.)

  const safeRedirect = safeRelativePath(input.redirectTo) ?? ''

  // Use app.PLATFORM_DOMAIN as the stable callback host for the redirectTo
  // option. admin.generateLink() stores no PKCE code_challenge, so Supabase's
  // verify endpoint does a stateless token_hash redirect to our callback —
  // no PKCE cookie is needed, so cross-domain confirmation works correctly.
  const isDev = process.env.NODE_ENV === 'development'
  const callbackBase = isDev
    ? `${origin}/auth/callback`
    : `https://app.${PLATFORM_DOMAIN}/auth/callback`

  // Full absolute destination the user should land on after confirming.
  // Stored in user_metadata so it survives the Supabase redirect without
  // relying on query params (which Supabase strips) or cross-subdomain cookies.
  const destination = `${origin}${safeRedirect || '/dashboard'}`

  // Use the service-role admin API to create the user and get action_link.
  const service = createServiceRoleClient()
  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: 'signup',
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        redirect_destination: destination,
      },
      redirectTo: callbackBase,
    },
  })

  if (linkError) return { data: null, error: linkError.message }
  if (!linkData?.user) return { data: null, error: 'Sign-up failed' }

  // Send the confirmation email via Resend using action_link — this goes
  // through Supabase's own verify endpoint which computes the correct
  // token_hash for the redirect, not the raw hashed_token we tried before.
  const confirmUrl = linkData.properties.action_link
  const { sendSignupConfirmation } = await import('@/actions/emails')
  await sendSignupConfirmation({
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    confirmUrl,
  })

  const userId = linkData.user.id
  const email = parsed.data.email

  // Create profile record
  await service.from('profiles').upsert({
    id: userId,
    full_name: parsed.data.fullName,
    email,
  })

  // If the player signed up on an org subdomain, add them to that org immediately
  // so they appear in Admin → Players without needing to complete a league registration.
  const orgId = headersList.get('x-org-id')
  if (orgId) {
    await service.from('org_members').upsert({
      organization_id: orgId,
      user_id: userId,
      role: 'player',
      status: 'active',
    }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })
  }

  // Link any pending team invites for this email
  const { data: pendingInvites } = await service
    .from('team_members')
    .select('id, organization_id, team_id')
    .eq('invited_email', email)
    .is('user_id', null)
    .eq('status', 'invited')

  if (pendingInvites && pendingInvites.length > 0) {
    // Update all pending invites to link this user
    await service
      .from('team_members')
      .update({ user_id: userId, status: 'active' })
      .eq('invited_email', email)
      .is('user_id', null)
      .eq('status', 'invited')

    // Ensure org membership for each org they were invited into
    const orgIds = [...new Set(pendingInvites.map((i) => i.organization_id))]
    for (const orgId of orgIds) {
      await service.from('org_members').upsert({
        organization_id: orgId,
        user_id: userId,
        role: 'player',
        status: 'active',
      }, { onConflict: 'organization_id,user_id', ignoreDuplicates: true })
    }
  }

  return { data: { userId }, error: null }
}

export async function logout() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/')
}


export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be 100 characters or fewer'),
  phone: optionalPhone,
  email_reminders_enabled: z.boolean().optional(),
  sms_opted_in: z.boolean().optional(),
  sms_game_day_enabled: z.boolean().optional(),
  push_reminders_enabled: z.boolean().optional(),
  sms_also_when_push: z.boolean().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'competitive']).optional(),
  t_shirt_size: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']).optional(),
  emergency_contact_name: z.string().trim().max(100).optional(),
  emergency_contact_phone: optionalPhone,
  show_contact_info: z.boolean().optional(),
  orgId: z.string().uuid(),
})

export async function updateProfile(input: z.infer<typeof updateProfileSchema>) {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return { data: null, error: 'Invalid input' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const db = createServiceRoleClient()
  const d = parsed.data
  // Write ONLY the keys the caller sent. Registration step 1 sends a few
  // fields; filling the rest with defaults turned email reminders back on,
  // hid the player's contact info and re-opted them into texts on every
  // registration. (CLAUDE.md: never write keys the caller didn't send.)
  const profileUpdate: Database['public']['Tables']['profiles']['Update'] = { full_name: d.full_name }
  if (d.phone !== undefined) profileUpdate.phone = d.phone ? toE164(d.phone) : null
  for (const key of ['email_reminders_enabled', 'sms_opted_in', 'sms_game_day_enabled', 'push_reminders_enabled', 'sms_also_when_push', 'show_contact_info'] as const) {
    if (d[key] !== undefined) profileUpdate[key] = d[key] as boolean
  }
  const detailsUpdate: Database['public']['Tables']['player_details']['Insert'] = { organization_id: d.orgId, user_id: user.id }
  for (const key of ['skill_level', 't_shirt_size', 'emergency_contact_name'] as const) {
    if (d[key] !== undefined) (detailsUpdate as Record<string, unknown>)[key] = d[key] || null
  }
  if (d.emergency_contact_phone !== undefined) detailsUpdate.emergency_contact_phone = d.emergency_contact_phone || null

  const [profileRes, detailsRes] = await Promise.all([
    db.from('profiles').update(profileUpdate).eq('id', user.id),
    db.from('player_details').upsert(detailsUpdate, { onConflict: 'organization_id,user_id' }),
  ])

  if (profileRes.error) return { data: null, error: profileRes.error.message }
  if (detailsRes.error) return { data: null, error: detailsRes.error.message }

  revalidatePath('/profile')
  return { data: null, error: null }
}
