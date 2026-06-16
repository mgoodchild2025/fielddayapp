'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CldUploadWidget } from 'next-cloudinary'
import { Upload } from 'lucide-react'
import { recordEventMediaUpload } from '@/actions/event-media'

/**
 * Cloudinary signed-upload button for event media. Uploads go straight to
 * Cloudinary (via the auth-gated /api/cloudinary/signature route); on success we
 * record metadata through a server action. Items start 'pending' until an admin
 * approves them. Renders nothing if Cloudinary isn't configured.
 */
export function EventMediaUpload({ leagueId, apiKey }: { leagueId: string; apiKey: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

  if (!cloudName || !apiKey) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSuccess(result: any) {
    const info = result?.info
    if (!info || typeof info !== 'object' || !info.public_id) return
    const isVideo = info.resource_type === 'video'
    const thumb = isVideo
      ? `https://res.cloudinary.com/${cloudName}/video/upload/so_0/${info.public_id}.jpg`
      : (info.secure_url as string)

    setBusy(true)
    const res = await recordEventMediaUpload({
      leagueId,
      publicId: info.public_id,
      url: info.secure_url,
      thumbnailUrl: thumb,
      mediaType: isVideo ? 'video' : 'image',
      width: info.width ?? undefined,
      height: info.height ?? undefined,
      durationSeconds: info.duration ?? undefined,
    })
    setBusy(false)
    if (res.error) setMsg(res.error)
    else { setMsg('Thanks! Your upload is pending approval.'); router.refresh() }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <CldUploadWidget
        signatureEndpoint="/api/cloudinary/signature"
        config={{ cloud: { cloudName, apiKey } }}
        options={{
          multiple: true,
          resourceType: 'auto',
          maxFileSize: 100_000_000,
          folder: `fieldday/events/${leagueId}`,
          sources: ['local', 'camera'],
          clientAllowedFormats: ['image', 'video'],
        }}
        onSuccess={handleSuccess}
      >
        {({ open }) => (
          <button
            type="button"
            onClick={() => open()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Upload className="w-4 h-4" />
            {busy ? 'Saving…' : 'Upload photos / video'}
          </button>
        )}
      </CldUploadWidget>
      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </div>
  )
}
