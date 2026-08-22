'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { PlayerBioCard, type BioCardData } from './player-bio-card'

/** Roster name → tap → the player's broadcast card in a modal. */
export function BioNameButton({ bio, children }: { bio: BioCardData; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left hover:underline decoration-dotted underline-offset-2"
        title="View bio card"
      >
        {children}
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="dialog" aria-modal="true" aria-label={`${bio.name} bio card`}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-gray-900 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <PlayerBioCard bio={bio} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-md border border-white/20 py-1.5 text-xs text-white/60 hover:bg-white/5"
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
