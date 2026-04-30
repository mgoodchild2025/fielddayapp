'use client'

import { useState, useRef, useEffect } from 'react'
import { signWaiver } from '@/actions/waivers'
import type { Database } from '@/types/database'

type Waiver = Database['public']['Tables']['waivers']['Row']

interface Props {
  org: { id: string }
  waiver: Waiver | null
  userId: string
  leagueId?: string
  onComplete: (signatureId: string) => void
  onSkip: () => void
}

export function Step2Waiver({ org, waiver, userId, leagueId, onComplete, onSkip }: Props) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [signatureName, setSignatureName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setScrolledToBottom(true) },
      { threshold: 0.5 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [])

  if (!waiver) {
    return (
      <div className="bg-white rounded-lg border p-6 text-center">
        <p className="text-gray-500 mb-4">No waiver required for this league.</p>
        <button onClick={onSkip} className="px-6 py-2.5 rounded-md font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
          Continue →
        </button>
      </div>
    )
  }

  async function handleSign() {
    if (!signatureName.trim()) { setError('Please type your full name to sign'); return }
    setLoading(true)
    setError(null)
    const result = await signWaiver({ waiverId: waiver!.id, signatureName: signatureName.trim(), leagueId })
    if (result.error) { setError(result.error); setLoading(false); return }
    onComplete(result.data!.signatureId)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold mb-1">{waiver.title}</h2>
        <p className="text-xs text-gray-400 mb-3">Scroll to the bottom to sign</p>
        <div className="h-72 overflow-y-auto border rounded-md p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {waiver.content}
          <div ref={sentinelRef} className="h-1" />
        </div>
      </div>

      <div className="bg-white rounded-lg border p-5 space-y-3">
        <h2 className="font-semibold">Sign Below</h2>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type your full legal name</label>
          <input
            type="text"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            disabled={!scrolledToBottom}
            placeholder={scrolledToBottom ? 'Your full name' : 'Scroll to the bottom to enable signing'}
            className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <button
          onClick={handleSign}
          disabled={!scrolledToBottom || !signatureName.trim() || loading}
          className="w-full py-3 rounded-md font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? 'Signing…' : 'I Agree & Sign →'}
        </button>
      </div>
    </div>
  )
}
