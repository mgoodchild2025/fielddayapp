import type { DisplaySponsor, SponsorBannerConfig } from '@/lib/display-types'

const SPEED_SECONDS: Record<SponsorBannerConfig['speed'], number> = {
  slow: 60, normal: 40, fast: 24,
}

/**
 * A horizontal auto-scrolling marquee of sponsor logos. Pure CSS animation
 * (keyframe `sponsor-marquee` in globals.css) — smooth on TVs/Chromecast with
 * no JS. The logo row is duplicated so the loop is seamless.
 */
export function SponsorBanner({
  sponsors, speed, theme,
}: {
  sponsors: DisplaySponsor[]
  speed: SponsorBannerConfig['speed']
  theme: 'dark' | 'light'
}) {
  if (sponsors.length === 0) return null
  const isDark = theme === 'dark'
  const duration = SPEED_SECONDS[speed] ?? 40

  const row = (keyed: string) => (
    <div className="flex shrink-0 items-center" style={{ gap: '4rem', paddingInline: '2rem' }} aria-hidden={keyed === 'b'}>
      {sponsors.map((s) => (
        <div key={`${keyed}-${s.id}`} className="flex items-center shrink-0" style={{ height: s.tier === 'gold' ? '4.5rem' : '3.25rem' }}>
          {s.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt={s.name} className="h-full w-auto object-contain" style={{ maxWidth: '16rem' }} />
          ) : (
            <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.name}</span>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div
      className="shrink-0 w-full overflow-hidden flex items-center"
      style={{
        height: '6rem',
        backgroundColor: isDark ? '#000000' : '#ffffff',
        borderTop: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
        borderBottom: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
      }}
    >
      <div
        className="flex items-center shrink-0"
        style={{ width: 'max-content', animation: `sponsor-marquee ${duration}s linear infinite`, willChange: 'transform' }}
      >
        {row('a')}
        {row('b')}
      </div>
    </div>
  )
}
