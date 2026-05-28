import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/tenant'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { getShopItems } from '@/actions/merchandise'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { ShopClient } from '@/components/shop/shop-client'

export default async function ShopPage() {
  await requireAuth()
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  if (!await canAccess(org.id, 'merchandise_shop')) notFound()

  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const [items, { data: branding }] = await Promise.all([
    getShopItems(org.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from('org_branding').select('logo_url, tagline').eq('organization_id', org.id).single(),
  ])

  const logoUrl = branding?.logo_url ?? null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={logoUrl} />

      {/* Branded hero */}
      <div
        className="relative py-10 sm:py-14 overflow-hidden"
        style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 flex flex-col items-center text-center gap-2">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={org.name} className="w-14 h-14 rounded-full object-contain mb-1 border-2 border-white/20 bg-white/10" />
          )}
          <h1
            className="text-3xl sm:text-4xl font-bold uppercase tracking-wide"
            style={{ fontFamily: 'var(--brand-heading-font)' }}
          >
            Shop
          </h1>
          <p className="text-sm opacity-70">{org.name} merchandise</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-700">No items available yet</p>
            <p className="text-sm text-gray-400">{org.name} hasn&apos;t added any shop items yet. Check back soon.</p>
          </div>
        ) : (
          <ShopClient items={items} />
        )}
      </div>

      <Footer org={org} />
    </div>
  )
}
