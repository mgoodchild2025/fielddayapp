'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'

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

function MedalModal({ medal, confetti, onClose }: { medal: MedalView; confetti: ConfettiPiece[] | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${medal.label} — ${medal.leagueName}`}
    >
      {confetti && <ConfettiBurst pieces={confetti} />}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-7 pt-9 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-gray-300 hover:text-gray-600"
        >
          ✕
        </button>

        <div className="text-6xl leading-none drop-shadow-md" aria-hidden>{GLYPH[medal.placement]}</div>
        <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[.14em] ${TINT[medal.placement]}`}>
          {medal.label}
        </p>
        <p className="mt-1 text-xl font-bold text-gray-900">{medal.teamName}</p>
        <p className="mt-2 text-sm text-gray-600">{medal.leagueName}</p>
        <p className="mt-0.5 text-[11px] font-medium tracking-widest text-gray-400">{awardedLabel(medal.awardedAt)}</p>

        {medal.teammates.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {medal.teammates.slice(0, 10).map((name) => (
              <span key={name} className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-600">{name}</span>
            ))}
            {medal.teammates.length > 10 && (
              <span className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-400">
                +{medal.teammates.length - 10} more
              </span>
            )}
          </div>
        )}

        {medal.leagueSlug && (
          <Link
            href={`/events/${medal.leagueSlug}`}
            className="mt-5 inline-block text-sm font-medium"
            style={{ color: 'var(--brand-primary)' }}
          >
            View the event →
          </Link>
        )}
      </div>
    </div>,
    document.body
  )
}

export function MedalCase({
  medals,
  isOwner = false,
  size = 'md',
  title,
}: {
  medals: MedalView[]
  /** True when the viewer owns these medals — enables first-open confetti. */
  isOwner?: boolean
  size?: 'sm' | 'md'
  /** Optional heading; omit to render just the strip. */
  title?: string
}) {
  const [open, setOpen] = useState<{ medal: MedalView; confetti: ConfettiPiece[] | null } | null>(null)
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {medals.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => openMedal(m)}
            className={`${glyphClass} leading-none transition-transform hover:scale-110 focus-visible:scale-110`}
            title={`${m.label} — ${m.leagueName}`}
            aria-label={`${m.label} — ${m.leagueName}, ${m.teamName}`}
          >
            {GLYPH[m.placement]}
          </button>
        ))}
      </div>
      {open && <MedalModal medal={open.medal} confetti={open.confetti} onClose={() => setOpen(null)} />}
    </div>
  )
}
