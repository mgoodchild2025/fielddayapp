'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { regenerateTeamCode } from '@/actions/teams'

interface Props {
  teamId: string
  code: string
}

export function TeamCodeBadge({ teamId, code: initialCode }: Props) {
  const [code, setCode] = useState(initialCode)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    if (!confirm('Generate a new code? The old code will stop working immediately.')) return
    setRegenerating(true)
    const result = await regenerateTeamCode(teamId)
    setRegenerating(false)
    if (result.data) setCode(result.data.team_code)
  }

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="text-xs text-gray-400">Code:</span>
      <button
        onClick={handleCopy}
        aria-label="Copy team code"
        title="Copy team code"
        className="group flex items-center gap-1 font-mono font-bold text-sm tracking-widest bg-gray-100 px-2 py-0.5 rounded hover:bg-gray-200 active:bg-gray-300 transition-colors cursor-pointer"
      >
        {code}
        {copied ? (
          <Check className="w-3 h-3 text-green-500 shrink-0" />
        ) : (
          <Copy className="w-3 h-3 text-gray-400 group-hover:text-gray-600 shrink-0 transition-colors" />
        )}
      </button>
      {copied && <span className="text-xs text-green-600 font-medium">Copied!</span>}
      <button
        onClick={handleRegenerate}
        disabled={regenerating}
        title="Regenerate code"
        className="text-xs text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        {regenerating ? '…' : '↺'}
      </button>
    </div>
  )
}
