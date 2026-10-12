import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { doorBrand, doorBrandStyle } from '@/lib/door/brand'
import { displayByToken, displayState, doorOrgId } from '@/lib/door/service'
import { DisplayBoard } from '@/components/door/display-board'
import { DISPLAY_TYPE } from '@/components/door/door-stripes'
import { safeRelativePath } from '@/lib/safe-redirect'

type Params = { params: Promise<{ displayToken: string }> }

/** Where "←" goes from the door screen, named for the place (opened from the app). */
function backFrom(from: string | undefined): { href: string; label: string } | null {
  const href = safeRelativePath(from)
  if (!href) return null
  const path = href.split('?')[0]
  const label = path === '/admin/courtside' ? 'Courtside'
    : path === '/admin/settings/door-alert' ? 'Door Alert settings'
    : path.startsWith('/admin') ? 'Admin'
    : 'Fieldday'
  return { href, label }
}

// Each display gets its own manifest so "Add to Home Screen" (required for
// notifications on iPhone) opens straight back to THIS display.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { displayToken } = await params
  return {
    title: 'Door display',
    manifest: `/door/display/${displayToken}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: 'Door', statusBarStyle: 'black-translucent' },
    icons: { apple: [{ url: '/api/org-icon?size=180', sizes: '180x180', type: 'image/png' }] },
  }
}

export default async function DoorDisplayPage({ params, searchParams }: Params & { searchParams: Promise<{ from?: string }> }) {
  const { displayToken } = await params
  const { from } = await searchParams
  const orgId = await doorOrgId()
  if (!orgId) notFound()
  const found = await displayByToken(orgId, displayToken)
  if (found.kind === 'missing') notFound()
  const brand = await doorBrand(orgId)

  if (found.kind === 'revoked') {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-5 bg-[#0B0B0C] px-6 text-center text-white">
        <p className={`${DISPLAY_TYPE} text-5xl`}>Disconnected</p>
        <p className="max-w-sm text-lg text-white/80">This display has been disconnected. Ask an admin for a new link, or join again with the staff QR or code.</p>
        <Link href="/door/join" className="press inline-flex min-h-12 items-center rounded-2xl border border-white/30 px-6 font-semibold">Join again</Link>
      </main>
    )
  }

  const initialState = await displayState(found.display, found.station, { screen: false })
  return (
    <div style={doorBrandStyle(brand)}>
      <DisplayBoard
        displayToken={displayToken}
        initialState={initialState}
        vapidKey={process.env.VAPID_PUBLIC_KEY ?? null}
        timezone={brand.timezone}
        orgName={brand.orgName}
        back={backFrom(from)}
      />
    </div>
  )
}
