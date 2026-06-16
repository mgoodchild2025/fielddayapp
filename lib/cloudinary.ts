import { v2 as cloudinary } from 'cloudinary'

/**
 * Server-side Cloudinary helpers for signed uploads + deletion.
 *
 * Required env (server-only except the public cloud name):
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME — shown to the browser upload widget
 *   CLOUDINARY_API_KEY                — signing + admin API
 *   CLOUDINARY_API_SECRET             — signing + admin API
 *
 * We use SIGNED uploads (not an unsigned preset) so only authenticated members
 * can upload — the signature is issued by an auth-gated server route.
 */

export const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? ''
const API_KEY = process.env.CLOUDINARY_API_KEY ?? ''
const API_SECRET = process.env.CLOUDINARY_API_SECRET ?? ''

/** Folder uploads land in, namespaced per org so assets are easy to find/clean up. */
export function uploadFolder(orgId: string, leagueId: string): string {
  return `fieldday/${orgId}/events/${leagueId}`
}

export function isCloudinaryConfigured(): boolean {
  return !!(CLOUD_NAME && API_KEY && API_SECRET)
}

export function cloudinaryApiKey(): string {
  return API_KEY
}

let configured = false
function ensureConfig() {
  if (configured) return
  cloudinary.config({ cloud_name: CLOUD_NAME, api_key: API_KEY, api_secret: API_SECRET, secure: true })
  configured = true
}

/**
 * Sign the params the browser upload widget will send. The widget passes a
 * `paramsToSign` object; we return the matching signature so Cloudinary accepts
 * the (otherwise unsigned) upload.
 */
export function signUploadParams(paramsToSign: Record<string, string | number>): string {
  ensureConfig()
  return cloudinary.utils.api_sign_request(paramsToSign, API_SECRET)
}

/** Delete an asset from Cloudinary (best-effort; called when media is removed). */
export async function destroyAsset(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<void> {
  if (!isCloudinaryConfigured()) return
  ensureConfig()
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true })
  } catch {
    // best-effort — the DB row is already gone; an orphaned asset is harmless
  }
}
