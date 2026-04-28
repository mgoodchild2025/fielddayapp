'use client'

import { useTransition } from 'react'
import { startImpersonation } from '@/actions/platform'

export function ImpersonateButton({ orgId }: { orgId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => startImpersonation(orgId))}
      disabled={pending}
      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-sm font-medium rounded-md transition-colors"
    >
      {pending ? 'Loading…' : 'Impersonate'}
    </button>
  )
}
