'use client'

import { useState } from 'react'
import { Link, Check, Printer } from 'lucide-react'
import QRCode from 'react-qr-code'

interface Props {
  url: string
  compact?: boolean
}

export function CopyWaiverLink({ url, compact = false }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Print poster URL: same path + /qr
  const printHref = `${url}/qr`

  if (compact) {
    return (
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        title="Copy waiver link"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Link className="w-3.5 h-3.5" />}
        {copied ? 'Copied!' : 'Copy waiver link'}
      </button>
    )
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start gap-4">
        {/* QR code */}
        <div className="shrink-0 bg-white border border-amber-200 rounded-lg p-2">
          <QRCode value={url} size={96} />
        </div>

        {/* Text + actions */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-amber-600 text-sm">⚠</span>
            <p className="text-sm font-semibold text-amber-900">Last Resort — Waiver Signing Only</p>
          </div>
          <p className="text-xs text-amber-800 mb-1 leading-relaxed">
            Use this <strong>only</strong> for players who are unable to complete online registration.
            Scanning this QR code signs the waiver but <strong>does not create a registration</strong> — the player will not appear in your registrations list or have a Fieldday account.
          </p>
          <p className="text-xs text-amber-700 mb-3">
            Encourage all players to register at your event page instead.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-white border border-amber-200 rounded px-2 py-1 text-amber-900 truncate max-w-full">
              {url}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <a
              href={printHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print QR Poster
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
