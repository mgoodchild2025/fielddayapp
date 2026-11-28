import type { WrappedView } from '@/lib/season-wrapped-load'

/**
 * The Season Wrapped story image (1080×1920 — the Instagram/Facebook story
 * size). Satori: flexbox only, every multi-child div display:flex, no emoji
 * (the medal is spelled out). Up to six tiles in a 2-column grid.
 */
export function WrappedStoryImage({ view, orgName, accent, teamColor }: {
  view: WrappedView
  orgName: string
  accent: string
  teamColor: string
}) {
  const { wrapped } = view
  const tiles = wrapped.tiles.slice(0, 6)
  const rows: (typeof tiles)[] = []
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2))

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1220', color: 'white', padding: '110px 80px 90px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', fontSize: 32, letterSpacing: 8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
        {orgName}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, color: accent, letterSpacing: 2, textTransform: 'uppercase' }}>
          Season wrapped
        </div>
        <div style={{ display: 'flex', marginTop: 14, fontSize: 64, fontWeight: 900, lineHeight: 1.05 }}>
          {view.league.name}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 56 }}>
        <div style={{ display: 'flex', width: 18, height: 110, borderRadius: 9, background: teamColor }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 58, fontWeight: 800 }}>{view.playerName}</div>
          {view.team && <div style={{ display: 'flex', fontSize: 38, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{view.team.name}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: 64, fontSize: 96, fontWeight: 900, lineHeight: 1, letterSpacing: -2, color: wrapped.medalGlyph ? accent : 'white' }}>
        {wrapped.headline}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 'auto' }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 28 }}>
            {row.map((t) => (
              <div key={t.key} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '30px 34px', borderRadius: 28, background: 'rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', fontSize: 92, fontWeight: 900, lineHeight: 1 }}>{t.value}</div>
                <div style={{ display: 'flex', marginTop: 12, fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{t.label}</div>
                {t.sub && <div style={{ display: 'flex', marginTop: 4, fontSize: 28, color: 'rgba(255,255,255,0.55)' }}>{t.sub}</div>}
              </div>
            ))}
            {row.length === 1 && <div style={{ display: 'flex', flex: 1 }} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', marginTop: 56, height: 12, width: 160, borderRadius: 6, background: accent }} />
    </div>
  )
}
