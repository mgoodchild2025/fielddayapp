'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { acceptScorekeeperInvite } from '@/actions/scorekeepers'
import { safeAction } from '@/lib/action-errors'

export function ScorekeeperInviteAccept({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function accept() {
    setError(null)
    start(async () => {
      const res = await safeAction(acceptScorekeeperInvite(token))
      if (res.error) {
        setError(res.error)
        return
      }
      toast.success('You’re a scorekeeper')
      router.push('/scorekeeping')
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="press w-full flex items-center justify-center min-h-11 rounded-lg font-semibold text-sm bg-brand-primary text-on-brand disabled:opacity-60"
      >
        {pending ? 'Accepting…' : 'Accept'}
      </button>
    </div>
  )
}
