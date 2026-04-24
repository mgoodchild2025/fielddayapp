'use client'

import { useState } from 'react'
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
      <span className="font-mono font-bold text-sm tracking-widest bg-gray-100 px-2 py-0.5 rounded">
        {code}
      </span>
      <button
        onClick={handleCopy}
        title="Copy code"
        className="text-xs text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
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
