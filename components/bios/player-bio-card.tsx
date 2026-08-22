'use client'

/**
 * The broadcast bio card (S1) — a TV lower-third. One component renders it
 * everywhere: the display showcase, the team-page roster modal, and the
 * profile editor's live preview, so the player previews exactly what airs.
 */

export interface BioCardData {
  name: string
  photoUrl: string | null      // hero photo, falling back to avatar; null = monogram
  teamName?: string | null
  position?: string | null
  jerseyNumber?: string | null
  hometown?: string | null
  yearsPlaying?: number | null
  tagline?: string | null
  /** Medal glyph string from the trophy case, e.g. "🥇🥇 🥈 🏆". */
  medalShelf?: string | null
  /** Optional one-line season stat summary, e.g. "12 kills · 4 aces". */
  statLine?: string | null
}

function ordinalSeason(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'
  return `${n}${suffix} season`
}

export function PlayerBioCard({ bio, size = 'md' }: { bio: BioCardData; size?: 'md' | 'tv' }) {
  const tv = size === 'tv'
  const chyronBits = [bio.teamName, bio.position, bio.jerseyNumber ? `#${bio.jerseyNumber}` : null]
    .filter(Boolean)
    .join(' · ')
  const metaBits = [
    bio.yearsPlaying != null && bio.yearsPlaying > 0 ? ordinalSeason(bio.yearsPlaying) : null,
    bio.hometown,
  ].filter(Boolean)

  return (
    <div className={`flex items-end gap-4 ${tv ? 'gap-8' : ''}`}>
      {/* Photo */}
      <div
        className={`shrink-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-gray-700 to-gray-900 ${
          tv ? 'h-[22rem] w-[17rem]' : 'h-36 w-28'
        }`}
      >
        {bio.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bio.photoUrl} alt={bio.name} className="h-full w-full object-cover" />
        ) : (
          <div className={`flex h-full w-full items-center justify-center font-bold text-white/40 ${tv ? 'text-8xl' : 'text-4xl'}`}>
            {bio.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Chyron */}
      <div className="min-w-0 pb-1">
        {chyronBits && (
          <span
            className={`inline-block bg-[var(--brand-primary)] font-mono uppercase tracking-[.16em] text-white ${
              tv ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-[10px]'
            }`}
          >
            {chyronBits}
          </span>
        )}
        <p
          className={`font-bold uppercase leading-none tracking-tight ${tv ? 'mt-3 text-7xl' : 'mt-1.5 text-3xl'}`}
          style={{ fontFamily: 'var(--brand-heading-font)' }}
        >
          {bio.name}
        </p>
        {metaBits.length > 0 && (
          <p className={`uppercase tracking-wide opacity-70 ${tv ? 'mt-2 text-2xl' : 'mt-1 text-xs'}`}>
            {metaBits.join(' · ')}
          </p>
        )}
        {bio.medalShelf && (
          <p className={`tracking-widest ${tv ? 'mt-3 text-4xl' : 'mt-1.5 text-lg'}`} title="Career medals">
            {bio.medalShelf}
          </p>
        )}
        {bio.statLine && (
          <p className={`font-mono uppercase tracking-wide opacity-70 ${tv ? 'mt-2 text-xl' : 'mt-1 text-[11px]'}`}>
            {bio.statLine}
          </p>
        )}
        {bio.tagline && (
          <p
            className={`italic opacity-80 ${tv ? 'mt-4 border-l-4 pl-4 text-2xl' : 'mt-2 border-l-2 pl-2 text-sm'}`}
            style={{ borderColor: 'var(--brand-secondary, #d4a017)' }}
          >
            &ldquo;{bio.tagline}&rdquo;
          </p>
        )}
      </div>
    </div>
  )
}
