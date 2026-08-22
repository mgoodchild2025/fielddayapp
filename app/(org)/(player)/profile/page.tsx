import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPlayerMedals } from '@/lib/medal-queries'
import { MedalCase } from '@/components/medals/medal-case'
import { BioEditor } from '@/components/bios/bio-editor'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { ProfileForm } from './profile-form'
import { MfaSettings } from '@/components/profile/mfa-settings'
import { getMfaStatus } from '@/lib/mfa'

export default async function ProfilePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: playerDetails }, { data: branding }, mfa] = await Promise.all([

    db.from('profiles').select('*').eq('id', user.id).single(),

    db.from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),

    db.from('org_branding').select('logo_url').eq('organization_id', org.id).single(),
    getMfaStatus(),
  ])

  // Trophy case, grouped by year (newest year first — loader sorts newest first)
  const myMedals = await getPlayerMedals(db, org.id, user.id)

  // Bio card: current values + the medal shelf the card shows
  const { data: myBio } = await db
    .from('player_bios')
    .select('jersey_number, position, hometown, years_playing, tagline, show_on_displays, hero_photo_url')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()
  const shelfCounts = myMedals.reduce(
    (acc, m) => { acc[m.placement] = (acc[m.placement] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )
  const medalShelf = (['gold', 'silver', 'bronze', 'tier_champion'] as const)
    .map((p) => ({ p, n: shelfCounts[p] ?? 0 }))
    .filter(({ n }) => n > 0)
    .map(({ p, n }) => ({ gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆' }[p].repeat(Math.min(n, 3)) + (n > 3 ? `×${n}` : '')))
    .join(' ') || null
  const medalsByYear = Object.entries(
    myMedals.reduce<Record<string, typeof myMedals>>((acc, m) => {
      const year = String(new Date(m.awardedAt).getFullYear())
      ;(acc[year] ??= []).push(m)
      return acc
    }, {})
  ).sort(([a], [b]) => Number(b) - Number(a))

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Profile
        </h1>
        <ProfileForm profile={profile} playerDetails={playerDetails} orgId={org.id} />

        {/* Bio card editor — the broadcast lower-third, previewed live */}
        <div className="mt-8">
          <BioEditor
            initial={{
              jerseyNumber: myBio?.jersey_number ?? null,
              position: myBio?.position ?? null,
              hometown: myBio?.hometown ?? null,
              yearsPlaying: myBio?.years_playing ?? null,
              tagline: myBio?.tagline ?? null,
              showOnDisplays: myBio?.show_on_displays ?? false,
              heroPhotoUrl: myBio?.hero_photo_url ?? null,
            }}
            playerName={profile?.full_name ?? 'Player'}
            avatarUrl={profile?.avatar_url ?? null}
            medalShelf={medalShelf}
            positions={[]}
          />
        </div>

        {/* Trophy case — every medal earned in this org, grouped by year */}
        {medalsByYear.length > 0 && (
          <div className="mt-8 bg-white rounded-xl border p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Trophy Case</p>
            <div className="space-y-4">
              {medalsByYear.map(([year, yearMedals]) => (
                <div key={year} className="flex items-start gap-4">
                  <span className="text-xs font-semibold text-gray-400 w-10 shrink-0 pt-2">{year}</span>
                  <MedalCase medals={yearMedals} isOwner />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security — optional MFA for all players */}
        <div className="mt-6">
          <MfaSettings isEnrolled={mfa.hasTotp} factorId={mfa.factorId} />
        </div>

        {/* Account links */}
        <div className="mt-8 pt-6 border-t flex flex-col gap-3">
          <Link
            href="/profile/communications"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Communication Preferences
          </Link>
          <Link
            href="/profile/privacy"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Privacy &amp; Your Data
          </Link>
        </div>
      </div>
      <Footer org={org} />
    </div>
  )
}
