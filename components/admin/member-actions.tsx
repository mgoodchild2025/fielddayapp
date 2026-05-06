'use client'

import { useState, useTransition } from 'react'
import { suspendMember, reinstateMember, deleteMember } from '@/actions/members'

interface Props {
  memberId: string
  memberName: string
  status: string
}

export function MemberActions({ memberId, memberName, status }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (status === 'suspended') {
    // Suspended: offer Reinstate or permanent Delete
    if (confirmDelete) {
      return (
        <span className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-red-700 font-medium">Delete permanently?</span>
          <button
            onClick={() =>
              startTransition(async () => {
                await deleteMember(memberId)
                setConfirmDelete(false)
              })
            }
            disabled={isPending}
            className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded font-medium disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </span>
      )
    }

    return (
      <span className="flex items-center gap-2">
        <button
          onClick={() =>
            startTransition(async () => {
              await reinstateMember(memberId)
            })
          }
          disabled={isPending}
          className="text-xs text-green-600 font-medium hover:underline disabled:opacity-50"
        >
          {isPending ? '…' : 'Reinstate'}
        </button>
        <span className="text-gray-200">|</span>
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-xs text-red-500 hover:text-red-700 font-medium"
          title={`Permanently delete ${memberName}`}
        >
          Delete
        </button>
      </span>
    )
  }

  // Active: offer Suspend
  const [confirmSuspend, setConfirmSuspend] = useState(false)

  if (confirmSuspend) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={() =>
            startTransition(async () => {
              await suspendMember(memberId)
              setConfirmSuspend(false)
            })
          }
          disabled={isPending}
          className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
        >
          {isPending ? 'Suspending…' : 'Confirm suspend'}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setConfirmSuspend(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirmSuspend(true)}
      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
      title={`Suspend ${memberName}`}
    >
      Suspend
    </button>
  )
}
