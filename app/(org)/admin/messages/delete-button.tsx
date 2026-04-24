'use client'

import { useState, useTransition } from 'react'
import { deleteAnnouncement } from '@/actions/messages'

export function DeleteAnnouncementButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <span className="flex flex-col items-end gap-1 shrink-0">
        <button
          onClick={() =>
            startTransition(async () => {
              await deleteAnnouncement(id)
            })
          }
          disabled={isPending}
          className="text-xs text-red-600 font-medium hover:underline"
        >
          {isPending ? 'Deleting…' : 'Delete'}
        </button>
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
      className="text-xs text-gray-400 hover:text-red-500 shrink-0 transition-colors"
    >
      Delete
    </button>
  )
}
