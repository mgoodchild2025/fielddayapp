'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  code: string
}

export function CopyableCode({ code }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy team code"
      className="group flex items-center gap-2 rounded-md px-2 py-1 -mx-2 -my-1 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
    >
      <span className="text-xl font-bold tracking-widest font-mono">
        {code}
      </span>
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium text-green-600">Copied!</span>
        </>
      ) : (
        <Copy className="w-4 h-4 text-gray-400 group-hover:text-gray-600 shrink-0 transition-colors" />
      )}
    </button>
  )
}
