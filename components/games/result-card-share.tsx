'use client'

import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Share2, Download } from 'lucide-react'
import { announce } from '@/lib/announce'

/**
 * The player's result card on the game page: a preview and one button that
 * hands the PNG to the phone's share sheet (Instagram, Messages, Save Image),
 * or downloads it where the browser can't share files. The image route checks
 * the viewer is on one of the teams, so it never needs a public link.
 */
const noSubscribe = () => () => {}

export function ResultCardShare({ src, fileName, title, heading = 'Your result card', anchorId = 'result', story = false }: {
  src: string; fileName: string; title: string
  heading?: string
  anchorId?: string
  /** A 9:16 story image (Season Wrapped) rather than the 4:5 result card. */
  story?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Browser-only: the server renders "Share" too, so the HTML matches on phones.
  const canShareFiles = useSyncExternalStore(noSubscribe, () => typeof navigator.canShare === 'function', () => true)
  if (failed) return null

  async function share() {
    setBusy(true)
    try {
      const res = await fetch(src, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const file = new File([blob], fileName, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title })
        } catch (e) {
          // Closing the share sheet isn't a failure.
          if ((e as DOMException)?.name !== 'AbortError') throw e
        }
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        announce('Result card downloaded')
      }
    } catch {
      toast.error("Couldn't make your result card. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }


  return (
    <div id={anchorId} className="mt-4 pt-4 border-t border-gray-100 scroll-mt-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 text-center">{heading}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        width={1080}
        height={story ? 1920 : 1350}
        loading="lazy"
        onError={() => setFailed(true)}
        className="mx-auto w-full max-w-[16rem] h-auto rounded-xl shadow-md bg-gray-900"
      />
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="press mx-auto mt-3 flex items-center justify-center gap-2 min-h-11 w-full max-w-[16rem] rounded-lg bg-brand-primary text-on-brand text-sm font-semibold disabled:opacity-60"
      >
        {canShareFiles ? <Share2 className="w-4 h-4" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
        {busy ? 'Getting it ready…' : canShareFiles ? 'Share' : 'Download'}
      </button>
    </div>
  )
}
