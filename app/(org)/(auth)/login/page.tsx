import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo } = await searchParams

  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  let orgName: string | null = null
  let logoUrl: string | null = null
  let tagline: string | null = null

  if (orgId) {
    const supabase = await createServerClient()
    const [orgRes, brandingRes] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('org_branding').select('logo_url, tagline').eq('organization_id', orgId).single(),
    ])
    orgName = orgRes.data?.name ?? null
    logoUrl = brandingRes.data?.logo_url ?? null
    tagline = brandingRes.data?.tagline ?? null
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
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
              <h1
                className="text-3xl font-bold uppercase mb-2"
                style={{ fontFamily: 'var(--brand-heading-font)' }}
              >
                Sign In
              </h1>
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
