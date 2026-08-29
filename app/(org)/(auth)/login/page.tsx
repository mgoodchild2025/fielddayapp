import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; token_hash?: string; type?: string; error?: string; reason?: string }>
}) {
  const { redirect: redirectTo, token_hash, type, error: errorParam, reason } = await searchParams

  // Supabase email templates sometimes point password-reset links at /login.
  // Forward recovery tokens to the confirm page so the user can set their password.
  if (token_hash && type === 'recovery') {
    redirect(`/reset-password/confirm?token_hash=${token_hash}&type=recovery`)
  }

  // Auth callbacks bounce here with ?error=confirmation_failed&reason=…, which
  // used to render as a plain login form over a scary URL. Translate the known
  // failures into something a person can act on.
  let errorBanner: string | null = null
  if (errorParam === 'confirmation_failed') {
    const r = (reason ?? '').toLowerCase()
    if (r.includes('code verifier')) {
      // PKCE: the flow finished in a different browser than it started in —
      // usually an in-app browser (Gmail/Instagram) handing off to Google.
      errorBanner = "That sign-in didn't finish in the same browser it started in — this can happen inside in-app browsers. Try the Google button again right here, or open this page in your regular browser first."
    } else if (r.includes('expired')) {
      errorBanner = 'That link has expired. Request a fresh one and try again.'
    } else {
      errorBanner = `Sign-in didn't complete${reason ? ` — ${reason}` : ''}. Please try again.`
    }
  }

  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  let orgName: string | null = null
  let logoUrl: string | null = null
  let tagline: string | null = null

  if (orgId) {
    const db = createServiceRoleClient()
    const [orgRes, brandingRes] = await Promise.all([

      db.from('organizations').select('name').eq('id', orgId).single(),

      db.from('org_branding').select('logo_url, tagline').eq('organization_id', orgId).single(),
    ])
    orgName = orgRes.data?.name ?? null
    logoUrl = brandingRes.data?.logo_url ?? null
    tagline = brandingRes.data?.tagline ?? null
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        {errorBanner && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorBanner}
          </div>
        )}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            {logoUrl ? (
              <>
                <Image
                  src={logoUrl}
                  alt={orgName ?? 'Logo'}
                  width={180}
                  height={72}
                  className="mx-auto object-contain mb-4"
                  style={{ maxHeight: '72px', width: 'auto' }}
                  unoptimized
                />
                {orgName && (
                  <p
                    className="text-lg font-semibold uppercase tracking-wide"
                    style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-text)' }}
                  >
                    {orgName}
                  </p>
                )}
              </>
            ) : orgName ? (
              <h1
                className="text-3xl font-bold uppercase mb-2"
                style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-primary)' }}
              >
                {orgName}
              </h1>
            ) : (
              <Image
                src="/Fieldday-Icon.png"
                alt="Fieldday"
                width={64}
                height={64}
                className="mx-auto mb-2 rounded-xl"
              />
            )}
          </Link>
          {tagline && (
            <p className="text-sm text-gray-500 mt-1">{tagline}</p>
          )}
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  )
}
