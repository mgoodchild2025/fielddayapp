'use client'

/**
 * Direct signed upload to Cloudinary from the browser — the same contract the
 * CldUploadWidget uses (signature from the auth-gated /api/cloudinary/signature
 * route, per-org/event folder), for cases where we already hold File objects
 * (Web Share Target) and can't hand them to the widget.
 */

export interface CloudinaryUploadResult {
  publicId: string
  url: string
  resourceType: 'image' | 'video'
  width?: number
  height?: number
  durationSeconds?: number
}

export async function uploadToCloudinary(
  file: File | Blob,
  opts: { cloudName: string; apiKey: string; folder: string; onProgress?: (fraction: number) => void },
): Promise<CloudinaryUploadResult> {
  const timestamp = Math.floor(Date.now() / 1000)
  const paramsToSign: Record<string, string | number> = { timestamp, folder: opts.folder }

  const sigRes = await fetch('/api/cloudinary/signature', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paramsToSign }),
  })
  if (!sigRes.ok) {
    const j = await sigRes.json().catch(() => ({}))
    throw new Error(j.error ?? `Couldn't sign the upload (${sigRes.status}).`)
  }
  const { signature } = (await sigRes.json()) as { signature: string }

  const fd = new FormData()
  fd.append('file', file)
  fd.append('api_key', opts.apiKey)
  fd.append('timestamp', String(timestamp))
  fd.append('signature', signature)
  fd.append('folder', opts.folder)

  // XHR for upload progress; fetch has none.
  const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${opts.cloudName}/auto/upload`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && opts.onProgress) opts.onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(body)
        else reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status}).`))
      } catch { reject(new Error('Upload failed.')) }
    }
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'))
    xhr.send(fd)
  })

  return {
    publicId: String(json.public_id),
    url: String(json.secure_url),
    resourceType: json.resource_type === 'video' ? 'video' : 'image',
    width: typeof json.width === 'number' ? json.width : undefined,
    height: typeof json.height === 'number' ? json.height : undefined,
    durationSeconds: typeof json.duration === 'number' ? json.duration : undefined,
  }
}
