'use client'

import { useTransition } from 'react'
import { checkInDropIn } from '@/actions/dropins'
import { useRouter } from 'next/navigation'

export function CheckInButton({ registrationId, sessionId }: { registrationId: string; sessionId: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <button
      onClick={() => start(async () => { await checkInDropIn(registrationId); router.refresh() })}
      disabled={pending}
      className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600"
    >
      {pending ? '…' : 'Check in'}
    </button>
  )
}
