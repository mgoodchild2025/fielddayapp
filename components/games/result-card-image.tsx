import type { TeamSideResult } from '@/lib/game-result-alerts'
import { cardHeadline, setLine, streakLabel } from '@/lib/game-result'

/** The result card's drawing (Satori: flexbox only, every multi-child div display:flex). */
export function ResultCardImage({ r, orgName, accent, myColor, theirColor, when }: {
  r: TeamSideResult; orgName: string; accent: string; myColor: string; theirColor: string
  when: { date: string; time: string } | null
}) {
  const sets = setLine(r.sets)
  const streak = streakLabel(r.streak)
  const headline = cardHeadline(r.outcome)
  const win = r.outcome === 'W'
  return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1220', color: 'white', padding: 80, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', height: 14, width: 180, background: accent, borderRadius: 7 }} />
        <div style={{ display: 'flex', marginTop: 36, fontSize: 34, letterSpacing: 6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>
          {orgName}
        </div>
        <div style={{ display: 'flex', marginTop: 8, fontSize: 40, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          {r.leagueName}{r.isExhibition ? ' · Exhibition' : ''}
        </div>

        <div style={{ display: 'flex', marginTop: 60, fontSize: headline.length > 3 ? 210 : 260, fontWeight: 900, lineHeight: 1, letterSpacing: -6, color: win ? accent : 'white' }}>
          {headline}
        </div>
        {streak && (
          <div style={{ display: 'flex', marginTop: 24 }}>
            <div style={{ display: 'flex', padding: '12px 28px', borderRadius: 999, background: accent, fontSize: 34, fontWeight: 800, letterSpacing: 3 }}>
              {streak}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 22 }}>
          {[
            { name: r.myTeam.name, score: r.myScore, color: myColor, strong: true },
            { name: r.opponent.name, score: r.theirScore, color: theirColor, strong: false },
          ].map((t) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: t.strong ? 1 : 0.7 }}>
              <div style={{ display: 'flex', width: 22, height: 96, borderRadius: 11, background: t.color }} />
              <div style={{ display: 'flex', flex: 1, fontSize: t.strong ? 64 : 54, fontWeight: t.strong ? 800 : 600, lineHeight: 1.1 }}>
                {t.name}
              </div>
              <div style={{ display: 'flex', fontSize: t.strong ? 120 : 100, fontWeight: 900 }}>{t.score}</div>
            </div>
          ))}
          {sets && (
            <div style={{ display: 'flex', fontSize: 36, color: 'rgba(255,255,255,0.7)' }}>Sets {sets}</div>
          )}
        </div>

        <div style={{ display: 'flex', marginTop: 48, paddingTop: 28, borderTop: '2px solid rgba(255,255,255,0.15)', fontSize: 32, color: 'rgba(255,255,255,0.6)' }}>
          {[when ? `${when.date} · ${when.time}` : null, r.court].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
}
