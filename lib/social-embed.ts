/**
 * Parse social post URLs (Instagram / TikTok / YouTube) into the bits we need to
 * store and embed. We never download media — we keep the permalink + ids and let
 * the platform render its official embed.
 */

export type SocialPlatform = 'youtube' | 'instagram' | 'tiktok'

export function detectSocialPlatform(url: string): SocialPlatform | null {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  if (/instagram\.com/i.test(url)) return 'instagram'
  if (/tiktok\.com/i.test(url)) return 'tiktok'
  return null
}

export function youTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&#/]+)/,
    /youtube\.com\/watch\?.*v=([^&#]+)/,
    /youtube\.com\/live\/([^?&#/]+)/,
    /youtube\.com\/shorts\/([^?&#/]+)/,
    /youtube\.com\/embed\/([^?&#/]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

/** Instagram post/reel/tv shortcode. */
export function instagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i)
  return m?.[1] ?? null
}

/** TikTok numeric video id from a full URL (short vm.tiktok.com links need oEmbed). */
export function tiktokVideoIdFromUrl(url: string): string | null {
  const m = url.match(/tiktok\.com\/[^/]+\/video\/(\d+)/i)
  return m?.[1] ?? null
}

/**
 * TikTok oEmbed — resolves short links and returns the video id + thumbnail +
 * author. Public endpoint, no auth needed.
 */
export async function fetchTikTokOEmbed(url: string): Promise<{
  videoId: string | null; thumbnail: string | null; author: string | null; title: string | null
} | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const d = await res.json()
    return {
      videoId: d.embed_product_id ?? null,
      thumbnail: d.thumbnail_url ?? null,
      author: d.author_name ?? null,
      title: d.title ?? null,
    }
  } catch {
    return null
  }
}
