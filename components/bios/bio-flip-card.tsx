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
        @media (prefers-reduced-motion: reduce) { .bio-flip-inner { transition: none; } }
      `}</style>
      <div
        className="bio-flip-inner relative"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div
          aria-hidden={flipped}
          className="rounded-2xl bg-gray-900 p-5"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <PlayerBioCard bio={bio} />
          <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-widest text-white/40">↻ tap to flip</p>
        </div>
        {/* Back — absolutely stacked, same footprint as the front */}
        <div
          aria-hidden={!flipped}
          className="absolute inset-0 overflow-hidden rounded-2xl bg-gray-900 p-5"
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
