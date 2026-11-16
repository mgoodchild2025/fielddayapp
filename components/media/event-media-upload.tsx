'use client'

import { useRef, useState } from 'react'
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
export function EventMediaUpload({ leagueId, orgId, apiKey, cloudName }: { leagueId: string; orgId: string; apiKey: string; cloudName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<(() => void) | null>(null)

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
    if (res.error) { setMsg(null); setError(res.error) }
    else { setMsg(res.approved ? 'Thanks! Your upload is live — it joins the gallery and the TV within a minute.' : 'Thanks! Your upload is pending approval.'); router.refresh() }
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
          folder: `fieldday/${orgId}/events/${leagueId}`,
          sources: ['local', 'camera'],
          clientAllowedFormats: ['image', 'video'],
          // Ask for the signature ourselves: when the stock signatureEndpoint
          // gets a refusal it hands the widget no signature and the widget
          // silently drops the file and goes back to "Browse" — players saw
          // nothing happen. Here a refusal closes the widget and says why.
          uploadSignature: (cb: (signature?: string) => void, paramsToSign: Record<string, unknown>) => {
            setError(null)
            fetch('/api/cloudinary/signature', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paramsToSign }),
            })
              .then(async (r) => {
                const body = await r.json().catch(() => null) as { signature?: string; error?: string } | null
                if (r.ok && body?.signature) { cb(body.signature); return }
                closeRef.current?.()
                setMsg(null)
                setError(body?.error ? `Couldn’t upload: ${body.error}` : `Couldn’t upload (server error ${r.status}). Please try again.`)
                console.warn('[event-media-upload] signature refused', r.status, body?.error)
              })
              .catch(() => {
                closeRef.current?.()
                setMsg(null)
                setError("Couldn’t reach the server — check your connection and try again.")
              })
          },
        }}
        onError={(err) => {
          const e = err as { statusText?: string; message?: string } | string | null
          const text = typeof e === 'string' ? e : (e?.statusText ?? e?.message ?? null)
          console.warn('[event-media-upload] widget error', err)
          setMsg(null)
          setError(text ? `Couldn’t upload: ${text}` : 'Couldn’t upload that file. Please try again.')
        }}
        onSuccess={handleSuccess}
      >
        {({ open, close }) => (
          <button
            type="button"
            onClick={() => { closeRef.current = close; setError(null); open() }}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Upload className="w-4 h-4" />
            {busy ? 'Saving…' : 'Upload photos / video'}
          </button>
        )}
      </CldUploadWidget>
      {msg && <p className="text-xs text-gray-500" role="status">{msg}</p>}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}
