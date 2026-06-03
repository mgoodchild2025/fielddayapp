import type { ResolvedSponsor } from '@/actions/event-sponsors'

/**
 * "Presented by" sponsor strip for the public event page. Logos link out when a
 * website is set. Renders nothing when there are no sponsors with logos.
 */
export function EventSponsorStrip({ sponsors, leagueId }: { sponsors: ResolvedSponsor[]; leagueId: string }) {
  const withLogos = sponsors.filter((s) => s.logo_url)
  if (withLogos.length === 0) return null

  const clickHref = (s: ResolvedSponsor) =>
    `/api/sponsors/click?l=${encodeURIComponent(leagueId)}&k=${encodeURIComponent(s.id)}&u=${encodeURIComponent(s.website_url!)}`

  return (
    <div className="bg-white border rounded-xl px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center mb-4">
        Presented by
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
        {withLogos.map((s) => {
          const logo = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.logo_url!}
              alt={s.name}
              className="object-contain opacity-80 hover:opacity-100 transition-opacity"
              style={{ height: s.tier === 'gold' ? '3.25rem' : '2.25rem', maxWidth: '11rem' }}
            />
          )
          return s.website_url ? (
            <a key={s.id} href={clickHref(s)} target="_blank" rel="noopener noreferrer" title={s.name}>
              {logo}
            </a>
          ) : (
            <span key={s.id} title={s.name}>{logo}</span>
          )
        })}
      </div>
    </div>
  )
}
