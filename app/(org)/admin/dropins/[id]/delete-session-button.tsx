'use client'

import { useTransition } from 'react'
import { deleteDropInSession } from '@/actions/dropins'
import { useRouter } from 'next/navigation'

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <button
      onClick={() => {
        if (!confirm('Delete this session and all registrations? This cannot be undone.')) return
        start(async () => { await deleteDropInSession(sessionId); router.push('/admin/dropins') })
      }}
      disabled={pending}
      className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Delete Session'}
    </button>
  )
}
