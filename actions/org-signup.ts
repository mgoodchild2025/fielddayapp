'use server'

import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getResend, FROM_EMAIL } from '@/lib/resend'

const signupSchema = z.object({
  orgName: z.string().min(2, 'Organization name must be at least 2 characters').max(60),
  slug: z
    .string()
    .min(2, 'Subdomain must be at least 2 characters')
    .max(30, 'Subdomain must be 30 characters or fewer')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  plan: z.enum(['starter', 'pro', 'club']).default('pro'),
})

export async function orgSignup(input: z.infer<typeof signupSchema>) {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', slug: null }

  const { orgName, slug, fullName, email, password, plan } = parsed.data
  const service = createServiceRoleClient()

  // Check signups are enabled
  const { data: setting } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'signups_enabled')
    .single()

  if (setting?.value === 'false') {
    return { error: 'New sign-ups are temporarily paused. Please check back soon.', slug: null }
  }

  // Check slug uniqueness
  const { data: existing } = await service
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) return { error: `"${slug}" is already taken — try a different subdomain`, slug: null }

  // Determine email redirect target
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
  const isDev = process.env.NODE_ENV === 'development'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const orgCallbackUrl = isDev
    ? `${appUrl}/auth/callback?next=/admin/dashboard`
    : `https://${slug}.${platformDomain}/auth/callback?next=/admin/dashboard`

  // Create user + generate confirmation link via admin API so we can send
  // the verification email through Resend instead of Supabase's email system.
  const { data: linkData, error: authError } = await service.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      data: { full_name: fullName },
      redirectTo: orgCallbackUrl,
    },
  })

  if (authError) return { error: authError.message, slug: null }
  if (!linkData?.user) return { error: 'Failed to create account', slug: null }

  const userId = linkData.user.id
  const confirmationUrl = linkData.properties?.action_link

  // Create profile row
  await service.from('profiles').upsert({ id: userId, full_name: fullName, email })

  // Create organization
  const { data: org, error: orgError } = await service
    .from('organizations')
    .insert({ name: orgName, slug, sport: 'multi', status: 'trial' })
    .select('id')
    .single()

  if (orgError) return { error: orgError.message, slug: null }

  const trialEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()

  await Promise.all([
    service.from('org_branding').insert({ organization_id: org.id }),
    service.from('subscriptions').insert({
      organization_id: org.id,
      plan_tier: plan,
      status: 'trialing',
      trial_end: trialEnd,
    }),
    service.from('org_members').insert({
      organization_id: org.id,
      user_id: userId,
      role: 'org_admin',
      status: 'active',
    }),
  ])

  // Send verification email via Resend
  if (confirmationUrl) {
    const resend = getResend()
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Confirm your Fieldday account',
      html: buildVerificationEmail({ fullName, orgName, confirmationUrl }),
    }).catch(() => {
      // non-fatal — user can request a resend
    })
  }

  // Notify all platform admins
  const { data: admins } = await service
    .from('profiles')
    .select('email')
    .eq('platform_role', 'platform_admin')

  if (admins && admins.length > 0) {
    const platformDomain2 = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'
    const orgUrl = `https://app.${platformDomain2}/super`
    const resend = getResend()
    const adminEmails = admins.map((a) => a.email).filter(Boolean) as string[]

    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject: `New organization signed up: ${orgName}`,
      html: buildNewOrgEmail({ orgName, slug, fullName, email, plan, orgUrl, platformDomain: platformDomain2 }),
    }).catch(() => {
      // non-fatal
    })
  }

  return { error: null, slug }
}

function buildVerificationEmail({
  fullName, orgName, confirmationUrl,
}: {
  fullName: string
  orgName: string
  confirmationUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#111827;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:16px;font-weight:700;letter-spacing:1px;">⚡ Fieldday</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">Confirm your email</h2>
      <p style="color:#6b7280;margin:0 0 8px;font-size:15px;line-height:1.6;">Hi ${fullName},</p>
      <p style="color:#6b7280;margin:0 0 28px;font-size:15px;line-height:1.6;">
        Thanks for signing up <strong>${orgName}</strong> on Fieldday. Click the button below to verify your email address and activate your 15-day free trial.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${confirmationUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">
          Confirm Email →
        </a>
      </div>
      <p style="color:#9ca3af;font-size:13px;text-align:center;margin:0;">
        This link expires in 24 hours. If you didn't sign up for Fieldday, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`
}

function buildNewOrgEmail({
  orgName, slug, fullName, email, plan, orgUrl, platformDomain,
}: {
  orgName: string
  slug: string
  fullName: string
  email: string
  plan: string
  orgUrl: string
  platformDomain: string
}): string {
  const planLabels: Record<string, string> = { starter: 'Starter', pro: 'Pro', club: 'Club' }
  const planLabel = planLabels[plan] ?? plan
  const orgDashboard = `https://${slug}.${platformDomain}/admin/dashboard`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#111827;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:16px;font-weight:700;letter-spacing:1px;">⚡ Fieldday Platform</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 4px;color:#111827;font-size:22px;">New Organization Signed Up</h2>
      <p style="color:#6b7280;margin:0 0 28px;font-size:14px;">A new organization has started a 15-day free trial.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;width:40%;">Organization</td>
          <td style="padding:10px 0;color:#111827;font-weight:600;">${orgName}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;">Subdomain</td>
          <td style="padding:10px 0;color:#111827;">${slug}.${platformDomain}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;">Owner</td>
          <td style="padding:10px 0;color:#111827;">${fullName}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;">Email</td>
          <td style="padding:10px 0;color:#111827;">${email}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;">Plan</td>
          <td style="padding:10px 0;color:#111827;">${planLabel} (trialing)</td>
        </tr>
      </table>
      <div style="text-align:center;margin:32px 0 8px;">
        <a href="${orgDashboard}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;margin-right:12px;">
          View Org Dashboard
        </a>
        <a href="${orgUrl}"
           style="display:inline-block;background:#f3f4f6;color:#374151;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
          Platform Admin
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function checkSlugAvailable(slug: string): Promise<{ available: boolean }> {
  if (!slug || slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) {
    return { available: false }
  }
  const service = createServiceRoleClient()
  const { data } = await service.from('organizations').select('id').eq('slug', slug).single()
  return { available: !data }
}
