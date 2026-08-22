import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * OG image for /champions (H3): a shared link unfurls with the org's newest
 * banners and title count. Satori-safe styling only (flexbox, no clip-path) —
 * the pennant shape is suggested with a gold rail and hanging rectangles.
 */

export const runtime = 'nodejs'
export const alt = 'Hall of Champions'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TINTS = ['#24406e', '#8c2f2b', '#2c5a41']

export default async function OgImage() {
  const headersList = await headers()
  const orgId = headersList.get('x-org-id')

  let orgName = 'Fieldday'
  let banners: { year: string; team: string; league: string }[] = []
  let total = 0

  if (orgId) {
    const db = createServiceRoleClient()
    const [{ data: org }, { data: golds }, { count }] = await Promise.all([
      db.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      db.from('medals')
        .select('team_name, league_name, awarded_at')
        .eq('organization_id', orgId).eq('placement', 'gold')
        .order('awarded_at', { ascending: false }).limit(3),
      db.from('medals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('placement', 'gold'),
    ])
    orgName = org?.name ?? orgName
    total = count ?? 0
    banners = (golds ?? []).map((m) => ({
      year: String(new Date(m.awarded_at).getFullYear()),
      team: m.team_name,
      league: m.league_name,
    }))
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          backgroundColor: '#14161a', color: '#f5efdd', padding: 56,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, letterSpacing: 6, color: '#e9c96a', textTransform: 'uppercase' }}>
              Hall of Champions
            </div>
            <div style={{ fontSize: 52, fontWeight: 700, marginTop: 6 }}>{orgName}</div>
          </div>
          {total > 0 && (
            <div style={{ display: 'flex', fontSize: 30, color: '#b3b6bc' }}>
              🏆 {total} title{total !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* The rafter rail */}
        <div style={{ display: 'flex', height: 10, backgroundColor: '#e9c96a', marginTop: 40, borderRadius: 4 }} />

        {/* Hanging banners */}
        <div style={{ display: 'flex', gap: 36, justifyContent: 'center', flex: 1 }}>
          {banners.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, color: '#b3b6bc' }}>
              The first banner is still up for grabs.
            </div>
          ) : (
            banners.map((b, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  width: 300, backgroundColor: TINTS[i % TINTS.length],
                  padding: '38px 24px 46px', borderBottom: '14px solid #e9c96a',
                }}
              >
                <div style={{ fontSize: 56, fontWeight: 700, color: '#e9c96a' }}>{b.year}</div>
                <div style={{ fontSize: 34, fontWeight: 700, textTransform: 'uppercase', marginTop: 14, textAlign: 'center' }}>
                  {b.team}
                </div>
                <div style={{ fontSize: 18, letterSpacing: 3, textTransform: 'uppercase', marginTop: 16, color: '#f5efddbb', textAlign: 'center' }}>
                  {b.league}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    ),
    size
  )
}
