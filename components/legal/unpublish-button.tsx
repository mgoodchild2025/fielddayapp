'use client'

import { useState, useTransition } from 'react'
import { unpublishDocument } from '@/actions/legal'

interface Props {
  slug: string
}

export function UnpublishButton({ slug }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Unpublish?</span>
        <button
          onClick={() => {
            startTransition(async () => {
              await unpublishDocument(slug)
              window.location.reload()
            })
          }}
          disabled={isPending}
          className="px-2.5 py-1 text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors"
        >
          {isPending ? 'Unpublishing…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-2.5 py-1 text-xs text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-400/30 rounded-lg transition-colors"
    >
      Unpublish
    </button>
  )
}
