'use client'

import { useState, useTransition } from 'react'
import { removeMember } from '@/actions/members'

export function RemoveMemberButton({
  memberId,
  memberName,
}: {
  memberId: string
  memberName: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={() =>
            startTransition(async () => {
              await removeMember(memberId)
              setConfirming(false)
            })
          }
          disabled={isPending}
          className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
        >
          {isPending ? 'Removing…' : 'Confirm'}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
      title={`Remove ${memberName}`}
    >
      Remove
    </button>
  )
}
