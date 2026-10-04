'use client'

import { useState } from 'react'
import { sendWaiverReminders } from '@/actions/waiver-requests'
import { confirmAction } from '@/components/ui/confirm-dialog'

interface Props {
  leagueId: string
  unsignedCount: number
  hasWaiver: boolean
}

export function SendWaiverRemindersButton({ leagueId, unsignedCount, hasWaiver }: Props) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  if (!hasWaiver) return null

  async function handleClick() {
    // Emails people — can't be unsent.
    if (!(await confirmAction({
      title: `Email ${unsignedCount} player${unsignedCount !== 1 ? 's' : ''}?`,
      message: 'Everyone who hasn\'t signed the waiver gets a reminder email.',
      confirmLabel: 'Send reminders',
    }))) return
    setLoading(true)
    setMessage(null)
    const result = await sendWaiverReminders(leagueId)
    setLoading(false)

    if (result.error) {
      setMessage({ text: result.error, isError: true })
    } else {
      setMessage({ text: `✓ ${result.sent} reminder${result.sent !== 1 ? 's' : ''} sent`, isError: false })
    }

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000)
  }

  if (unsignedCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 px-3 py-1.5 border border-green-200 rounded-md bg-green-50">
        All signed ✓
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="press text-xs font-medium px-3 min-h-10 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? 'Sending…' : `Send Waiver Reminders (${unsignedCount} unsigned)`}
      </button>
      {message && (
        <span className={`fd-fade-in text-xs font-medium ${message.isError ? 'text-red-600' : 'text-green-600'}`}>
          {message.text}
        </span>
      )}
    </span>
  )
}
