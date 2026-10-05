'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { activateRegistration } from '@/actions/registrations'
import { safeAction } from '@/lib/action-errors'

/** Approve a pending registration — says so when the server refuses (it used to look like nothing happened). */
export function ApproveRegistrationButton({ registrationId, playerName }: { registrationId: string; playerName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const res = await safeAction(activateRegistration(registrationId))
        if (res?.error) { toast.error(`Couldn't approve ${playerName}: ${res.error}`); return }
        toast.success(`${playerName} approved`)
        router.refresh()
      })}
      className="press min-h-10 text-xs font-medium text-brand-primary hover:underline disabled:opacity-60"
    >
      {pending ? 'Approving…' : 'Approve'}
    </button>
  )
}
