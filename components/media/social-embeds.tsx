'use client'

import { useEffect } from 'react'
import type { CuratedSocialPost } from '@/actions/event-social'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById(id)) { resolve(); return }
    const s = document.createElement('script')
    s.id = id; s.src = src; s.async = true
    s.onload = () => resolve()
    document.body.appendChild(s)
  })
}

/** Renders official Instagram/TikTok/YouTube embeds for curated event posts.
 *  Media is served by the platforms — we never host it. */
export function SocialEmbeds({ posts }: { posts: CuratedSocialPost[] }) {
  useEffect(() => {
    if (posts.some((p) => p.platform === 'instagram')) {
      loadScript('https://www.instagram.com/embed.js', 'ig-embed-js').then(() => window.instgrm?.Embeds.process())
    }
    if (posts.some((p) => p.platform === 'tiktok')) {
      // Re-add so blockquotes rendered this pass get processed.
      document.getElementById('tt-embed-js')?.remove()
      loadScript('https://www.tiktok.com/embed.js', 'tt-embed-js')
    }
  }, [posts])

  if (posts.length === 0) return null

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
      {posts.map((p) => (
        <div key={p.id} className="mb-4 break-inside-avoid">
          {p.platform === 'youtube' && p.embedUrl ? (
            <div className="relative w-full overflow-hidden rounded-xl border bg-black" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={p.embedUrl}
                title={p.caption ?? 'YouTube video'}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          ) : p.platform === 'tiktok' ? (
            <blockquote
              className="tiktok-embed"
              cite={p.mediaUrl}
              data-video-id={p.externalId}
              style={{ maxWidth: '100%', minWidth: '100%' }}
            >
              <a href={p.mediaUrl} target="_blank" rel="noopener noreferrer">{p.caption ?? 'View on TikTok'}</a>
            </blockquote>
          ) : (
            <blockquote
              className="instagram-media"
              data-instgrm-permalink={p.mediaUrl}
              data-instgrm-version="14"
              style={{ maxWidth: '100%', minWidth: '100%', margin: 0 }}
            >
              <a href={p.mediaUrl} target="_blank" rel="noopener noreferrer">View on Instagram</a>
            </blockquote>
          )}
        </div>
      ))}
    </div>
  )
}
