import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '@/lib/supabase/server'
import { NavUserMenu } from './nav-user-menu'
import type { OrgContext } from '@/lib/tenant'

interface OrgNavProps {
  org: OrgContext
  logoUrl: string | null
}

export async function OrgNav({ org, logoUrl }: OrgNavProps) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userName: string | null = null
  let isAdmin = false

  if (user) {
    const [{ data: profile }, { data: member }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('org_members').select('role').eq('organization_id', org.id).eq('user_id', user.id).single(),
    ])
    userName = profile?.full_name ?? user.email ?? null
    isAdmin = ['org_admin', 'league_admin'].includes(member?.role ?? '')
  }

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{ backgroundColor: 'var(--brand-secondary)', color: 'white' }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          {logoUrl ? (
            <Image src={logoUrl} alt={org.name} width={120} height={40} className="object-contain h-9 w-auto" />
          ) : (
            <span className="text-xl font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--brand-heading-font)' }}>
              {org.name}
            </span>
          )}
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/leagues" className="opacity-80 hover:opacity-100 transition-opacity">Leagues</Link>
          <Link href="/schedule" className="opacity-80 hover:opacity-100 transition-opacity">Schedule</Link>
          <Link href="/standings" className="opacity-80 hover:opacity-100 transition-opacity">Standings</Link>

          {user ? (
            <NavUserMenu userName={userName} isAdmin={isAdmin} />
          ) : (
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-md font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Sign In
            </Link>
          )}
        </div>

        <button className="md:hidden p-2 rounded opacity-80 hover:opacity-100" aria-label="Open menu">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
