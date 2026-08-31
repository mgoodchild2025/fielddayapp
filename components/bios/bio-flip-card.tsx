'use client'

import { useState } from 'react'
import type { PlayerCareer } from '@/lib/career'
import { PlayerBioCard, type BioCardData } from './player-bio-card'
import { PlayerCardBack } from './player-card-back'

/**
 * The flippable player card (C2): bio front, career-record back, CSS 3D flip
 * on tap. Reduced motion drops the rotation (instant swap); the card is a
 * button and the hidden face is inert for screen readers.
 */

export function BioFlipCard({ bio, career }: { bio: BioCardData; career: PlayerCareer | null }) {
  const [flipped, setFlipped] = useState(false)

  // C3 treatments, both derived from the record: a first-season player gets
  // the ROOKIE ribbon; a gold in the last year gets the champion foil.
  const isRookie = career != null && career.seasonCount <= 1
  const isFoil = career?.reigningChampion === true

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={flipped ? 'Show player card' : 'Show career record'}
      className="block w-full text-left"
      style={{ perspective: '1200px' }}
    >
      <style>{`
        .bio-flip-face { transition: transform .6s cubic-bezier(.3,.7,.3,1); backface-visibility: hidden; -webkit-backface-visibility: hidden; grid-area: 1 / 1; }
        .bio-foil { position: relative; }
        .bio-foil::after {
          content: ""; position: absolute; inset: 0; border-radius: 1rem; pointer-events: none;
          border: 2px solid transparent;
          background: linear-gradient(115deg, #e8c26a, #fdf3d0, #b78a28, #f4e3ae, #e8c26a) border-box;
          -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          background-size: 300% 300%;
          animation: bio-foil-sheen 6s ease-in-out infinite;
        }
        @keyframes bio-foil-sheen {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bio-flip-face { transition: none; }
          .bio-foil::after { animation: none; }
        }
      `}</style>
      {/* Grid-stacked faces that rotate INDEPENDENTLY (no preserve-3d, no
          absolute positioning): WebKit mishandles preserve-3d + absolute
          children (it already bled the rookie badge through the back once,
          and shifted the card on flip), and grid stacking sizes the card to
          the TALLER face — a long career table no longer gets clipped to the
          front's height. */}
      <div className="grid">
        {/* Front */}
        <div
          aria-hidden={flipped}
          className={`bio-flip-face relative rounded-2xl bg-gray-900 p-5 ${isFoil ? 'bio-foil' : ''}`}
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <PlayerBioCard bio={bio} />
          <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-widest text-white/40">↻ tap to flip</p>
          {/* Rookie ribbon: on the PHOTO corner (hockey-card convention), never
              over text — the old top-right spot collided with the chyron on
              narrow screens. Rendered last (paints above the photo without a
              z-index), WITHOUT a stacking context and unmounted while flipped:
              WebKit lets z-indexed children escape the parent's
              backface-visibility, which bled the badge through the card back. */}
          {isRookie && !flipped && (
            <span className="absolute left-3 top-3 rounded-sm bg-red-600/90 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[.2em] text-white shadow">
              Rookie
            </span>
          )}
        </div>
        {/* Back — same grid cell; both faces stretch to the taller one */}
        <div
          aria-hidden={!flipped}
          className={`bio-flip-face overflow-hidden rounded-2xl bg-gray-900 p-5 ${isFoil ? 'bio-foil' : ''}`}
          style={{ transform: flipped ? 'rotateY(0deg)' : 'rotateY(-180deg)' }}
        >
          {career ? (
            <PlayerCardBack bio={bio} career={career} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/50">Loading career…</div>
          )}
        </div>
      </div>
    </button>
  )
}
