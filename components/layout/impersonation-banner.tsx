'use client'

import { useTransition } from 'react'
import { exitImpersonation } from '@/actions/platform'

export function ImpersonationBanner({ orgName }: { orgName: string }) {
  const [pending, start] = useTransition()
  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-2 bg-orange-600 text-white text-sm font-medium">
      <span>Viewing as <strong>{orgName}</strong> (super admin impersonation)</span>
      <button
        onClick={() => start(() => exitImpersonation())}
        disabled={pending}
        className="ml-4 px-3 py-1 rounded bg-white/20 hover:bg-white/30 disabled:opacity-60 text-xs font-semibold"
      >
        {pending ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  )
}
