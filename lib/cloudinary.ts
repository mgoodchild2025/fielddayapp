import { v2 as cloudinary } from 'cloudinary'
import { assetBelongsToOrg, eventFolderFor } from '@/lib/cloudinary-scope'

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
export const uploadFolder = eventFolderFor

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

export type AssetLookup =
  | { status: 'found'; asset: { public_id: string; folder?: string | null; asset_folder?: string | null; secure_url: string } }
  | { status: 'missing' }
  | { status: 'unavailable' }

/**
 * What Cloudinary itself says about an asset (Admin API). The browser reports
 * a public id and URL after uploading; nothing it says is trusted until this
 * confirms the asset exists in OUR account and where it lives
 * (lib/cloudinary-scope.ts decides whether that is the right place).
 */
export async function describeAsset(publicId: string, resourceType: 'image' | 'video'): Promise<AssetLookup> {
  if (!isCloudinaryConfigured()) return { status: 'unavailable' }
  ensureConfig()
  try {
    const res = await cloudinary.api.resource(publicId, { resource_type: resourceType })
    if (!res?.public_id || !res?.secure_url) return { status: 'missing' }
    return { status: 'found', asset: { public_id: res.public_id, folder: res.folder ?? null, asset_folder: res.asset_folder ?? null, secure_url: res.secure_url } }
  } catch (err) {
    const code = (err as { error?: { http_code?: number }; http_code?: number })?.error?.http_code ?? (err as { http_code?: number })?.http_code
    return code === 404 ? { status: 'missing' } : { status: 'unavailable' }
  }
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

/**
 * Bulk-delete assets from Cloudinary (used when purging an org's media on
 * account closure). Batches by resource type, ≤100 per Admin API call.
 * Best-effort — returns how many ids were submitted for deletion.
 */
export async function destroyAssets(items: { publicId: string; resourceType: 'image' | 'video' }[]): Promise<number> {
  if (!isCloudinaryConfigured() || items.length === 0) return 0
  ensureConfig()
  const byType: Record<'image' | 'video', string[]> = { image: [], video: [] }
  for (const it of items) byType[it.resourceType].push(it.publicId)

  let submitted = 0
  for (const type of ['image', 'video'] as const) {
    const ids = byType[type]
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      try {
        await cloudinary.api.delete_resources(chunk, { resource_type: type, invalidate: true })
        submitted += chunk.length
      } catch {
        // best-effort; continue with remaining chunks
      }
    }
  }
  return submitted
}

/**
 * Of these assets, the ones Cloudinary confirms are in THIS org's folders
 * (Admin API, 100 ids per call). Used before a bulk delete: rows recorded
 * before uploads were verified could name another org's asset. A chunk that
 * can't be looked up is left out — an orphaned file is harmless, a wrongly
 * deleted one is not.
 */
export async function ownedAssets(
  items: { publicId: string; resourceType: 'image' | 'video' }[],
  orgId: string,
): Promise<{ publicId: string; resourceType: 'image' | 'video' }[]> {
  if (!isCloudinaryConfigured() || items.length === 0) return []
  ensureConfig()
  const owned: { publicId: string; resourceType: 'image' | 'video' }[] = []
  for (const type of ['image', 'video'] as const) {
    const ids = items.filter((i) => i.resourceType === type).map((i) => i.publicId)
    for (let i = 0; i < ids.length; i += 100) {
      try {
        const res = await cloudinary.api.resources_by_ids(ids.slice(i, i + 100), { resource_type: type })
        for (const r of (res?.resources ?? []) as { public_id: string; folder?: string; asset_folder?: string }[]) {
          if (assetBelongsToOrg(r, orgId)) owned.push({ publicId: r.public_id, resourceType: type })
        }
      } catch {
        // skip this chunk
      }
    }
  }
  return owned
}

/** Signed URL that downloads a ZIP archive of the given public ids (one resource
 *  type per archive). Returns null when not configured or no ids. */
export function archiveDownloadUrl(publicIds: string[], resourceType: 'image' | 'video'): string | null {
  if (!isCloudinaryConfigured() || publicIds.length === 0) return null
  ensureConfig()
  return cloudinary.utils.download_zip_url({ public_ids: publicIds, resource_type: resourceType, target_format: 'zip' })
}
