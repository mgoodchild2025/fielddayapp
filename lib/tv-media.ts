/**
 * Event videos on the TV showcase. Pure (tested).
 *
 * Phone videos arrive as .mov/HEVC at full resolution — heavy on gym wifi and
 * not playable in every TV browser. Cloudinary transcodes on delivery: we ask
 * for an MP4 (H.264 plays everywhere) no wider than 1280px at automatic
 * quality, by inserting a transformation and swapping the extension.
 */

const CLOUDINARY_VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/

export function tvVideoUrl(url: string): string {
  const m = CLOUDINARY_VIDEO.exec(url)
  if (!m) return url
  const rest = m[2].replace(/\.[a-z0-9]+$/i, '') + '.mp4'
  return `${m[1]}q_auto,w_1280,c_limit/${rest}`
}

/** Videos play to the end, but never hold the screen longer than this. */
export const MAX_VIDEO_SLIDE_S = 45

/** How long a video slide stays up: its length (a beat over), capped; unknown → 20 s (+1). */
export function videoSlideSeconds(durationSeconds: number | null | undefined): number {
  const d = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 20
  return Math.min(MAX_VIDEO_SLIDE_S, Math.max(4, Math.ceil(d) + 1))
}
