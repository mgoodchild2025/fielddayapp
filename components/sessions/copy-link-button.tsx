'use client'

import { useState } from 'react'
import { Link as LinkIcon, Check } from 'lucide-react'

interface Props {
  url: string
  label?: string
}

/** Copies a URL to the clipboard with brief "Copied!" feedback. Used to share
 *  the self-serve drop-in registration link without opening the QR poster. */
export function CopyLinkButton({ url, label = 'Copy link' }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold border text-gray-700 hover:bg-gray-50"
    >
      {copied ? <Check className="w-4 h-4 text-green-600" /> : <LinkIcon className="w-4 h-4" />}
      {copied ? 'Copied!' : label}
    </button>
  )
}
