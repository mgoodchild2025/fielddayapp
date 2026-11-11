/**
 * Which Cloudinary uploads a member may sign, and which assets an org owns.
 * Pure (tested); the Cloudinary SDK calls live in lib/cloudinary.ts.
 *
 * The signature route used to sign WHATEVER the browser sent, so a member could
 * get a valid signature for any public_id, folder, overwrite or eager
 * transformation — i.e. write anywhere in the account. Only the parameters the
 * upload widget actually sends are signed now, and only for the folder of an
 * event in the caller's own org.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** `fieldday/<org>/events/<league>` — the one place event media is uploaded to. */
export function eventFolderFor(orgId: string, leagueId: string): string {
  return `fieldday/${orgId}/events/${leagueId}`
}

/** The league id in an event folder of THIS org, or null for any other folder. */
export function leagueIdFromEventFolder(folder: unknown, orgId: string): string | null {
  if (typeof folder !== 'string') return null
  const m = new RegExp(`^fieldday/${orgId}/events/(${UUID})$`, 'i').exec(folder)
  return m ? m[1] : null
}

/** Parameters the upload widget sends that are harmless to sign. Nothing else is. */
const SIGNABLE = new Set(['timestamp', 'folder', 'source', 'custom_coordinates', 'face_coordinates', 'tags', 'context'])

export type VettedParams =
  | { ok: true; params: Record<string, string | number>; leagueId: string }
  | { ok: false; error: string }

export function vetParamsToSign(input: unknown, orgId: string, nowSeconds: number): VettedParams {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Missing paramsToSign.' }
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SIGNABLE.has(key)) return { ok: false, error: `Upload option "${key.slice(0, 40)}" is not allowed.` }
    if (typeof value === 'number' && Number.isFinite(value)) params[key] = value
    else if (typeof value === 'string' && value.length <= 500) params[key] = value
    else return { ok: false, error: `Upload option "${key}" is not valid.` }
  }
  const leagueId = leagueIdFromEventFolder(params.folder, orgId)
  if (!leagueId) return { ok: false, error: 'Uploads go to an event of this organization.' }
  // A signature is good for an hour at Cloudinary; don't sign one for another time.
  const ts = Number(params.timestamp)
  if (!Number.isFinite(ts) || Math.abs(ts - nowSeconds) > 3600) return { ok: false, error: 'Upload request has expired — try again.' }
  return { ok: true, params, leagueId }
}

/**
 * Is an asset Cloudinary describes inside the given event folder? Works in
 * both of Cloudinary's folder modes: older accounts put the folder in the
 * public id ("fieldday/<org>/events/<league>/abc"), newer ones report it as
 * `asset_folder` and leave the public id bare.
 */
export function assetIsInFolder(
  asset: { public_id?: string | null; folder?: string | null; asset_folder?: string | null } | null | undefined,
  folder: string,
): boolean {
  if (!asset) return false
  if (asset.asset_folder === folder || asset.folder === folder) return true
  return typeof asset.public_id === 'string' && asset.public_id.startsWith(`${folder}/`) && !asset.public_id.includes('..')
}

/** Is it in ANY folder of this org (for assets recorded before the folder was checked)? */
export function assetBelongsToOrg(
  asset: { public_id?: string | null; folder?: string | null; asset_folder?: string | null } | null | undefined,
  orgId: string,
): boolean {
  if (!asset) return false
  const prefix = `fieldday/${orgId}/`
  return [asset.asset_folder, asset.folder, asset.public_id].some((v) => typeof v === 'string' && v.startsWith(prefix) && !v.includes('..'))
}
