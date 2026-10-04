'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EventMediaItem } from '@/actions/event-media'
import { cloudinaryThumb } from '@/lib/cloudinary-url'
import { Overlay, useRetained } from '@/components/ui/overlay'
import { EmptyState } from '@/components/ui/empty-state'
import { Camera } from 'lucide-react'

/** Read-only responsive grid of approved event media. A tap opens the shared
 *  lightbox — photos at screen size (not the multi-MB original in a new tab),
 *  videos playing inline — with arrows / ← → to step through. */
export function EventMediaGallery({ items, showLeague = false }: { items: EventMediaItem[]; showLeague?: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const close = useCallback(() => setOpenIndex(null), [])
  const prev = useCallback(() => setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i)), [])
  const next = useCallback(() => setOpenIndex((i) => (i !== null && i < items.length - 1 ? i + 1 : i)), [items.length])

  useEffect(() => {
    if (openIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIndex, prev, next])

  // The item stays on screen while the lightbox fades out.
  const shownIndex = useRetained(openIndex)
  const current = shownIndex !== null ? items[shownIndex] : null

  if (items.length === 0) {
    return (
      <EmptyState icon={Camera} title="No photos or videos yet" hint={showLeague ? undefined : 'Be the first — upload yours above.'} />
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {items.map((m, idx) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenIndex(idx)}
            aria-label={m.caption ?? (m.mediaType === 'video' ? `Video ${idx + 1}` : `Photo ${idx + 1}`)}
            className="group relative block aspect-square overflow-hidden rounded-lg bg-gray-100 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              // The stored thumbnail is the raw upload — a multi-megabyte phone
              // photo behind a ~150px tile. Size it at delivery time instead.
              src={cloudinaryThumb(m.thumbnailUrl ?? m.url, { width: 400, height: 400 })}
              alt={m.caption ?? 'Event media'}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            {m.mediaType === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55">
                  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.34-5.89a1.5 1.5 0 000-2.54L6.3 2.84z" />
                  </svg>
                </span>
              </span>
            )}
            {(m.caption || m.uploaderName || (showLeague && m.leagueName)) && (
              // Hover-reveal on desktop; always visible on touch screens (no hover there).
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                {showLeague && m.leagueName && <p className="text-xs font-semibold text-white truncate">{m.leagueName}</p>}
                {m.caption && <p className="text-xs text-white line-clamp-2">{m.caption}</p>}
                {m.uploaderName && <p className="text-xs text-white/80 truncate">by {m.uploaderName}</p>}
              </div>
            )}
          </button>
        ))}
      </div>

      <Overlay
        open={openIndex !== null}
        onClose={close}
        label="Photo lightbox"
        className="p-0"
        panelClassName="relative w-screen h-dvh bg-black/90 flex items-center justify-center"
      >
        {current && shownIndex !== null && (
          <div className="absolute inset-0 flex items-center justify-center" onClick={close}>
            <button
              className="press absolute top-3 right-3 min-h-11 min-w-11 text-white/70 hover:text-white text-4xl leading-none z-10"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
              onClick={close}
              aria-label="Close"
            >
              ×
            </button>

            {shownIndex > 0 && (
              <button
                className="press absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 min-h-11 min-w-11 text-white/70 hover:text-white text-5xl z-10"
                onClick={(e) => { e.stopPropagation(); prev() }}
                aria-label="Previous"
              >
                ‹
              </button>
            )}

            <div
              className="max-w-5xl max-h-[90vh] mx-14 sm:mx-20 flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {current.mediaType === 'video' ? (
                <video
                  key={current.id}
                  src={current.url}
                  poster={current.thumbnailUrl ? cloudinaryThumb(current.thumbnailUrl, { width: 1280, crop: 'fit' }) : undefined}
                  controls
                  playsInline
                  className="fd-result-in max-h-[75vh] w-auto rounded-lg shadow-2xl"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  // Screen-sized, auto quality/format — the original stays
                  // behind the "Full size" link.
                  src={cloudinaryThumb(current.url, { width: 1600, crop: 'fit' })}
                  alt={current.caption ?? `Photo ${shownIndex + 1}`}
                  className="fd-result-in max-h-[75vh] w-auto object-contain rounded-lg shadow-2xl"
                />
              )}
              {(current.caption || current.uploaderName) && (
                <p className="text-white/90 text-sm text-center max-w-xl px-2">
                  {current.caption}
                  {current.caption && current.uploaderName && ' · '}
                  {current.uploaderName && <span className="text-white/70">by {current.uploaderName}</span>}
                </p>
              )}
              <p className="flex items-center gap-3 text-white/70 text-xs">
                <span aria-live="polite">{shownIndex + 1} / {items.length}</span>
                <a href={current.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                  Full size
                </a>
              </p>
            </div>

            {shownIndex < items.length - 1 && (
              <button
                className="press absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 min-h-11 min-w-11 text-white/70 hover:text-white text-5xl z-10"
                onClick={(e) => { e.stopPropagation(); next() }}
                aria-label="Next"
              >
                ›
              </button>
            )}
          </div>
        )}
      </Overlay>
    </>
  )
}
