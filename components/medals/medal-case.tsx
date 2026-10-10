'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Overlay, useRetained } from '@/components/ui/overlay'

/**
 * The Trophy Case (T2): one medal strip + one celebration modal, shared by the
 * dashboard, the profile, and the team page so a medal looks identical
 * everywhere. Confetti fires the first time the OWNER opens each of their own
 * medals (localStorage), stays quiet after — and respects reduced motion.
 */

export interface MedalView {
  id: string
  placement: 'gold' | 'silver' | 'bronze' | 'tier_champion'
  label: string
  leagueName: string
  leagueSlug?: string | null
  teamName: string
  teamId?: string | null
  awardedAt: string
  teammates: string[]
}

const GLYPH: Record<MedalView['placement'], string> = {
  gold: '🥇', silver: '🥈', bronze: '🥉', tier_champion: '🏆',
}
const TINT: Record<MedalView['placement'], string> = {
  gold: 'text-amber-600', silver: 'text-gray-500', bronze: 'text-orange-700', tier_champion: 'text-purple-600',
}

function awardedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }).toUpperCase()
}

// ── Confetti: ~60 DOM particles, no library ──────────────────────────────────
// Pieces are generated in the click handler (render must stay pure).
type ConfettiPiece = { left: number; delay: number; duration: number; color: string; size: number; rotate: number }

function makeConfetti(): ConfettiPiece[] {
  const colors = ['#e5b93c', '#b8bdc6', '#c07a3d', '#7c3aed', '#2563eb', '#16a34a']
  return Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.6 + Math.random() * 1.2,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 6,
    rotate: Math.random() * 360,
  }))
}

function ConfettiBurst({ pieces }: { pieces: ConfettiPiece[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes medal-confetti-fall {
          0% { transform: translateY(-10%) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .medal-confetti { display: none; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="medal-confetti absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `medal-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  )
}

/** The celebration card's content — shown in the shared Overlay (scroll lock,
 *  Escape, focus trap; it was a hand-rolled fixed div). */
function MedalCard({ medal, onClose, cardNudge }: { medal: MedalView; onClose: () => void; cardNudge?: CardNudgeLink | null }) {
  return (
    <>
        <button
          onClick={onClose}
          aria-label="Close"
          className="press absolute right-2 top-2 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100"
        >
          ✕
        </button>

        <div className="text-6xl leading-none drop-shadow-md" aria-hidden>{GLYPH[medal.placement]}</div>
        <p className={`mt-3 text-xs font-semibold uppercase tracking-[.14em] ${TINT[medal.placement]}`}>
          {medal.label}
        </p>
        <p className="mt-1 text-xl font-bold text-gray-900">{medal.teamName}</p>
        <p className="mt-2 text-sm text-gray-600">{medal.leagueName}</p>
        <p className="mt-0.5 text-xs font-medium tracking-widest text-gray-500">{awardedLabel(medal.awardedAt)}</p>

        {medal.teammates.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {medal.teammates.slice(0, 10).map((name) => (
              <span key={name} className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-600">{name}</span>
            ))}
            {medal.teammates.length > 10 && (
              <span className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                +{medal.teammates.length - 10} more
              </span>
            )}
          </div>
        )}

        {medal.leagueSlug && (
          <Link
            href={`/events/${medal.leagueSlug}`}
            className="press mt-4 inline-flex items-center min-h-10 text-sm font-medium"
            style={{ color: 'var(--brand-primary-ink, var(--brand-primary))' }}
          >
            View the event →
          </Link>
        )}

        {cardNudge && (
          <Link
            href={cardNudge.href}
            onClick={onClose}
            className="press mt-3 flex items-center justify-center min-h-10 rounded-lg bg-gray-50 border px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {cardNudge.text} →
          </Link>
        )}
    </>
  )
}

/** A one-line link under the celebration ("It's on your card now. Add a photo?"). */
export interface CardNudgeLink { text: string; href: string }

export function MedalCase({
  medals,
  isOwner = false,
  size = 'md',
  title,
  cardNudge = null,
}: {
  medals: MedalView[]
  /** True when the viewer owns these medals — enables first-open confetti. */
  isOwner?: boolean
  size?: 'sm' | 'md'
  /** Optional heading; omit to render just the strip. */
  title?: string
  /** Owner only: nudge toward the player card the medal now sits on. */
  cardNudge?: CardNudgeLink | null
}) {
  const [open, setOpen] = useState<{ medal: MedalView; confetti: ConfettiPiece[] | null } | null>(null)
  // Keep the card on screen while the overlay fades out.
  const shown = useRetained(open)
  if (medals.length === 0) return null

  function openMedal(m: MedalView) {
    // First time the OWNER views this medal → confetti (then never again)
    let confetti: ConfettiPiece[] | null = null
    if (isOwner) {
      const key = `medal-seen-${m.id}`
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        confetti = makeConfetti()
      }
    }
    setOpen({ medal: m, confetti })
  }

  const glyphClass = size === 'sm' ? 'text-2xl' : 'text-4xl'

  return (
    <div>
      {title && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {medals.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => openMedal(m)}
            // At least 40px to tap, even at size sm (the glyph was ~24px).
            className={`press ${glyphClass} leading-none inline-flex items-center justify-center min-h-10 min-w-10 rounded-lg hover:bg-gray-100`}
            title={`${m.label} — ${m.leagueName}`}
            aria-label={`${m.label} — ${m.leagueName}, ${m.teamName}`}
          >
            {GLYPH[m.placement]}
          </button>
        ))}
      </div>
      {/* Nothing said these were tappable but a hover-only title. */}
      {title && <p className="mt-1 text-xs text-gray-500">Tap a medal to see it.</p>}
      <Overlay
        open={!!open}
        onClose={() => setOpen(null)}
        label={shown ? `${shown.medal.label} — ${shown.medal.leagueName}` : 'Medal'}
        panelClassName="relative w-full max-w-sm rounded-2xl bg-white p-7 pt-9 text-center shadow-2xl max-h-[90dvh] overflow-y-auto"
      >
        {shown && <MedalCard medal={shown.medal} onClose={() => setOpen(null)} cardNudge={isOwner ? cardNudge : null} />}
      </Overlay>
      {/* Confetti in its own full-screen layer above the overlay: inside the
          panel, its entrance transform would trap the falling pieces. */}
      {open?.confetti && createPortal(
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
          <ConfettiBurst pieces={open.confetti} />
        </div>,
        document.body,
      )}
    </div>
  )
}
