'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteAnnouncement } from '@/actions/messages'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { safeAction } from '@/lib/action-errors'

// In-app confirm (the old inline "Delete / Cancel" were stacked 12px links
// about 4px apart on a phone).
export function DeleteAnnouncementButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  async function handleDelete() {
    if (!(await confirmAction({ title: 'Delete this message?', message: "It's removed from the history. Anything already sent stays sent.", confirmLabel: 'Delete', destructive: true }))) return
    startTransition(async () => {
      const res = await safeAction(deleteAnnouncement(id))
      if (res && 'error' in res && res.error) { toast.error(res.error); return }
      toast.success('Message deleted')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="press shrink-0 inline-flex items-center min-h-10 px-2 -mr-2 text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
