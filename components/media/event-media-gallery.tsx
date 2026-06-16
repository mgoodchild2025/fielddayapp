import type { EventMediaItem } from '@/actions/event-media'

/** Read-only responsive grid of approved event media. Videos show a poster with
 *  a play overlay and open the source on click. */
export function EventMediaGallery({ items, showLeague = false }: { items: EventMediaItem[]; showLeague?: boolean }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-8 text-center">
        <p className="text-3xl">📸</p>
        <p className="mt-2 text-sm font-medium text-gray-600">No photos or videos yet</p>
        <p className="text-xs text-gray-400">Be the first — upload yours above.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
      {items.map((m) => (
        <a
          key={m.id}
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block aspect-square overflow-hidden rounded-lg bg-gray-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.thumbnailUrl ?? m.url}
            alt={m.caption ?? 'Event media'}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          {m.mediaType === 'video' && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55">
                <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.34-5.89a1.5 1.5 0 000-2.54L6.3 2.84z" />
                </svg>
              </span>
            </span>
          )}
          {(m.caption || m.uploaderName || (showLeague && m.leagueName)) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
              {showLeague && m.leagueName && <p className="text-[10px] font-semibold text-white/90 truncate">{m.leagueName}</p>}
              {m.caption && <p className="text-[11px] text-white line-clamp-2">{m.caption}</p>}
              {m.uploaderName && <p className="text-[10px] text-white/70 truncate">by {m.uploaderName}</p>}
            </div>
          )}
        </a>
      ))}
    </div>
  )
}
