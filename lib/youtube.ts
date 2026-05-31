/**
 * YouTube Data API v3 helpers — public channel data via an API key
 * (no OAuth needed for read-only access to public uploads + live status).
 *
 * Requires env: YOUTUBE_API_KEY
 */

const API = 'https://www.googleapis.com/youtube/v3'

function key(): string | null {
  return process.env.YOUTUBE_API_KEY ?? null
}

export interface YouTubeChannel {
  channelId: string
  title: string
  uploadsPlaylistId: string
}

/**
 * Resolve a channel from a channel ID, @handle, or full URL.
 * Returns the channel's title + uploads playlist ID.
 */
export async function resolveYouTubeChannel(input: string): Promise<{ channel: YouTubeChannel | null; error: string | null }> {
  const k = key()
  if (!k) return { channel: null, error: 'YouTube API key is not configured on the server.' }

  const raw = input.trim()
  // Extract a channel ID or handle from common URL formats
  let channelId: string | null = null
  let handle: string | null = null

  const idMatch = raw.match(/channel\/(UC[\w-]+)/) || raw.match(/^(UC[\w-]+)$/)
  if (idMatch) channelId = idMatch[1]
  const handleMatch = raw.match(/@([\w.-]+)/)
  if (handleMatch) handle = handleMatch[1]
  if (!channelId && !handle && raw.startsWith('@')) handle = raw.slice(1)

  try {
    let url: string
    if (channelId) {
      url = `${API}/channels?part=snippet,contentDetails&id=${channelId}&key=${k}`
    } else if (handle) {
      url = `${API}/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${k}`
    } else {
      return { channel: null, error: 'Enter a YouTube channel URL, @handle, or channel ID.' }
    }

    const res = await fetch(url)
    if (!res.ok) return { channel: null, error: `YouTube API error (${res.status}).` }
    const data = await res.json()
    const item = data.items?.[0]
    if (!item) return { channel: null, error: 'Channel not found. Double-check the URL or handle.' }

    return {
      channel: {
        channelId: item.id,
        title: item.snippet?.title ?? '',
        uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? '',
      },
      error: null,
    }
  } catch (err) {
    return { channel: null, error: err instanceof Error ? err.message : 'Failed to reach YouTube.' }
  }
}

export interface YouTubeVideo {
  videoId: string
  title: string
  thumbnailUrl: string | null
  publishedAt: string | null
  liveBroadcastContent: 'live' | 'upcoming' | 'none'
}

/**
 * Fetch the channel's most recent uploads (with live status) cheaply:
 * playlistItems.list (~1 unit) → videos.list (~1 unit). Avoids the
 * 100-unit search.list call.
 */
export async function fetchRecentUploads(uploadsPlaylistId: string, max = 15): Promise<YouTubeVideo[]> {
  const k = key()
  if (!k || !uploadsPlaylistId) return []

  try {
    const plRes = await fetch(`${API}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${max}&key=${k}`)
    if (!plRes.ok) return []
    const plData = await plRes.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids: string[] = (plData.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean)
    if (ids.length === 0) return []

    const vRes = await fetch(`${API}/videos?part=snippet,liveStreamingDetails&id=${ids.join(',')}&key=${k}`)
    if (!vRes.ok) return []
    const vData = await vRes.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (vData.items ?? []).map((v: any) => ({
      videoId: v.id,
      title: v.snippet?.title ?? '',
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
      publishedAt: v.snippet?.publishedAt ?? null,
      liveBroadcastContent: (v.snippet?.liveBroadcastContent ?? 'none') as 'live' | 'upcoming' | 'none',
    }))
  } catch {
    return []
  }
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}
