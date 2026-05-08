'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

type Photo = { id: string; url: string; caption: string | null; display_order: number }

export function GalleryGrid({ photos }: { photos: Photo[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const close = useCallback(() => setOpenIndex(null), [])
  const prev  = useCallback(() => setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i)), [])
  const next  = useCallback(() => setOpenIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i)), [photos.length])

  // Keyboard navigation
  useEffect(() => {
    if (openIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     close()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIndex, close, prev, next])

  // Lock body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = openIndex !== null ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [openIndex])

  if (photos.length === 0) {
    return (
      <div className="text-center py-24 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg font-medium">No photos yet</p>
        <p className="text-sm mt-1">Check back soon.</p>
      </div>
    )
  }

  const current = openIndex !== null ? photos[openIndex] : null

  return (
    <>
      {/* Responsive masonry grid */}
      <div className="columns-2 sm:columns-3 gap-3 space-y-3">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            className="break-inside-avoid block w-full rounded-xl overflow-hidden group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand-primary)]"
            onClick={() => setOpenIndex(idx)}
            aria-label={photo.caption ?? `Photo ${idx + 1}`}
          >
            <Image
              src={photo.url}
              alt={photo.caption ?? ''}
              width={600}
              height={400}
              className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              unoptimized
            />
            {photo.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-3 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                <p className="text-white text-xs truncate">{photo.caption}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {current && openIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-5 text-white/60 hover:text-white text-4xl leading-none z-10 transition-colors"
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>

          {/* Prev arrow */}
          {openIndex > 0 && (
            <button
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-5xl z-10 px-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); prev() }}
              aria-label="Previous photo"
            >
              ‹
            </button>
          )}

          {/* Image — stopPropagation prevents close when clicking the image itself */}
          <div
            className="max-w-5xl max-h-[90vh] mx-14 sm:mx-20 flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={current.url}
              alt={current.caption ?? ''}
              width={1920}
              height={1080}
              className="max-h-[80vh] w-auto object-contain rounded-lg shadow-2xl"
              unoptimized
            />
            {current.caption && (
              <p className="text-white/80 text-sm text-center max-w-xl px-2">{current.caption}</p>
            )}
            <p className="text-white/40 text-xs">
              {openIndex + 1} / {photos.length}
            </p>
          </div>

          {/* Next arrow */}
          {openIndex < photos.length - 1 && (
            <button
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-5xl z-10 px-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); next() }}
              aria-label="Next photo"
            >
              ›
            </button>
          )}
        </div>
      )}
    </>
  )
}
