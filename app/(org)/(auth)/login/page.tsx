import { headers } from 'next/headers'
import Image from 'next/image'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo } = await searchParams

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()

  const { data: branding } = await supabase
    .from('org_branding')
    .select('logo_url, tagline')
    .eq('organization_id', org.id)
    .single()

  const logoUrl = branding?.logo_url ?? null
  const tagline = branding?.tagline ?? null

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={org.name}
              width={180}
              height={72}
              className="mx-auto object-contain mb-4"
              style={{ maxHeight: '72px', width: 'auto' }}
              unoptimized
            />
          ) : (
            <h1
              className="text-3xl font-bold uppercase mb-2"
              style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-primary)' }}
            >
              {org.name}
            </h1>
          )}
          {logoUrl && (
            <p
              className="text-lg font-semibold uppercase tracking-wide"
              style={{ fontFamily: 'var(--brand-heading-font)', color: 'var(--brand-text)' }}
            >
              {org.name}
            </p>
          )}
          {tagline && (
            <p className="text-sm text-gray-500 mt-1">{tagline}</p>
          )}
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  )
}
