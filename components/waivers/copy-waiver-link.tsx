'use client'

import { useState } from 'react'
import { Link, Check } from 'lucide-react'

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
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Link className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-900 mb-0.5">Shareable Waiver Link</p>
          <p className="text-xs text-blue-600 mb-3">
            Send this link to players so they can sign without creating an account.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-white border border-blue-200 rounded px-2 py-1 text-blue-800 truncate max-w-full">
              {url}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
