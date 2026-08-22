'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
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
      <button
        type="button"
        onClick={handleOpen}
        className="text-left hover:underline decoration-dotted underline-offset-2"
        title="View player card"
      >
        {children}
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="dialog" aria-modal="true" aria-label={`${bio.name} player card`}
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <BioFlipCard bio={bio} career={career} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded-md border border-white/20 py-1.5 text-xs text-white/60 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
