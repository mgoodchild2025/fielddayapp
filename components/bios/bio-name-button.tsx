'use client'

import { useState } from 'react'
import { Overlay } from '@/components/ui/overlay'
import { getCareerForUser } from '@/actions/career'
import type { PlayerCareer } from '@/lib/career'
import type { BioCardData } from './player-bio-card'
import { BioFlipCard } from './bio-flip-card'

/**
 * Roster name → tap → the player's card in a modal, flippable to the career
 * back. The career loads lazily on open (fetching every roster member's
 * career up-front would be N queries nobody may look at).
 */
export function BioNameButton({ bio, userId, children }: { bio: BioCardData; userId: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [career, setCareer] = useState<PlayerCareer | null>(null)

  function handleOpen() {
    setOpen(true)
    if (userId && !career) {
      getCareerForUser(userId).then((r) => { if (r.career) setCareer(r.career) }).catch(() => {})
    }
  }

  return (
    <>
      {/* Permanently dotted: phones never show a hover underline, so the
          name gave no hint that it opens a card. */}
      <button
        type="button"
        onClick={handleOpen}
        className="text-left underline decoration-dotted decoration-gray-400 underline-offset-4 hover:decoration-current"
        title="View player card"
      >
        {children}
      </button>
      {/* Shared Overlay: scroll lock, Escape, focus trap + restore. */}
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        variant="modal"
        label={`${bio.name} player card`}
        panelClassName="w-full max-w-md"
      >
        <BioFlipCard bio={bio} career={career} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press mt-3 w-full min-h-11 rounded-md border border-white/30 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          Close
        </button>
      </Overlay>
    </>
  )
}
