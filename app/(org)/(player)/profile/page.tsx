import { headers } from 'next/headers'
import Link from 'next/link'
import { getCurrentOrg } from '@/lib/tenant'
import { yearInTimezone } from '@/lib/format-time'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPlayerMedals } from '@/lib/medal-queries'
import { getPlayerCareer } from '@/lib/career'
import { MedalCase } from '@/components/medals/medal-case'
import { BioEditor } from '@/components/bios/bio-editor'
import { OrgNav } from '@/components/layout/org-nav'
import { Footer } from '@/components/layout/footer'
import { ProfileForm } from './profile-form'
import { MfaSettings } from '@/components/profile/mfa-settings'
import { PushSettingsCard } from '@/components/pwa/push-settings-card'
import { getMfaStatus } from '@/lib/mfa'
import { redirectToLogin } from '@/lib/auth'
import { SignOutButton } from '@/components/auth/sign-out-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Me' }

export default async function ProfilePage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)
  const supabase = await createServerClient()
  const db = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectToLogin()

  const [{ data: profile }, { data: playerDetails }, { data: branding }, mfa] = await Promise.all([

    db.from('profiles').select('*').eq('id', user.id).single(),

    db.from('player_details').select('*').eq('organization_id', org.id).eq('user_id', user.id).single(),

    db.from('org_branding').select('logo_url, timezone').eq('organization_id', org.id).single(),
    getMfaStatus(),
  ])
  // Medals group by the ORG's calendar year (the server's year is UTC).
  const timezone = branding?.timezone ?? 'America/Toronto'

  // Trophy case, grouped by year (newest year first — loader sorts newest first)
  const myMedals = await getPlayerMedals(db, org.id, user.id)
  const myCareer = await getPlayerCareer(db, org.id, user.id)

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
      const year = String(yearInTimezone(m.awardedAt, timezone))
      ;(acc[year] ??= []).push(m)
      return acc
    }, {})
  ).sort(([a], [b]) => Number(b) - Number(a))

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <OrgNav org={org} logoUrl={branding?.logo_url ?? null} />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold uppercase mb-6" style={{ fontFamily: 'var(--brand-heading-font)' }}>
          My Profile
        </h1>
        <ProfileForm profile={profile} playerDetails={playerDetails} orgId={org.id} />

        {/* Bio card editor — the broadcast lower-third, previewed live.
            id="bio": the dashboard's "Edit" / "Set up your player card" links
            deep-link here. scroll-mt keeps the heading clear of the nav. */}
        <div id="bio" className="mt-8 scroll-mt-20">
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
            career={myCareer}
          />
        </div>

        {/* Trophy case — every medal earned in this org, grouped by year */}
        {medalsByYear.length > 0 && (
          <div className="mt-8 bg-white rounded-xl border p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Trophy Case</p>
            <div className="space-y-4">
              {medalsByYear.map(([year, yearMedals]) => (
                <div key={year} className="flex items-start gap-4">
                  <span className="text-xs font-semibold text-gray-500 w-10 shrink-0 pt-2">{year}</span>
                  <MedalCase medals={yearMedals} isOwner />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phone alerts — per-device Web Push switch */}
        <div className="mt-6">
          <PushSettingsCard />
        </div>

        {/* Security — optional MFA for all players */}
        <div className="mt-6">
          <MfaSettings isEnrolled={mfa.hasTotp} factorId={mfa.factorId} />
        </div>

        {/* Account links. The Me tab covers My Teams, so it's reachable here —
            not only through the ☰ drawer — and so is signing out. */}
        <div className="mt-8 pt-6 border-t flex flex-col gap-1">
          <Link
            href="/my-teams"
            className="press inline-flex items-center gap-2 min-h-11 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            My Teams
          </Link>
          <Link
            href="/profile/communications"
            className="press inline-flex items-center gap-2 min-h-11 text-sm text-gray-600 hover:text-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Communication Preferences
          </Link>
          <Link
            href="/profile/privacy"
            className="press inline-flex items-center gap-2 min-h-11 text-sm text-gray-600 hover:text-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Privacy &amp; Your Data
          </Link>
          <SignOutButton className="press inline-flex items-center gap-2 min-h-11 text-sm font-medium text-red-600 hover:text-red-700" />
        </div>
      </div>
      </main>
      <Footer org={org} />
    </div>
  )
}
