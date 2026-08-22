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
        .bio-flip-inner { transition: transform .6s cubic-bezier(.3,.7,.3,1); transform-style: preserve-3d; }
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
          .bio-flip-inner { transition: none; }
          .bio-foil::after { animation: none; }
        }
      `}</style>
      <div
        className="bio-flip-inner relative"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div
          aria-hidden={flipped}
          className={`relative rounded-2xl bg-gray-900 p-5 ${isFoil ? 'bio-foil' : ''}`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {isRookie && (
            <span className="absolute right-4 top-4 z-10 rounded-sm bg-red-600/90 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[.2em] text-white">
              Rookie
            </span>
          )}
          <PlayerBioCard bio={bio} />
          <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-widest text-white/40">↻ tap to flip</p>
        </div>
        {/* Back — absolutely stacked, same footprint as the front */}
        <div
          aria-hidden={!flipped}
          className={`absolute inset-0 overflow-hidden rounded-2xl bg-gray-900 p-5 ${isFoil ? 'bio-foil' : ''}`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
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
