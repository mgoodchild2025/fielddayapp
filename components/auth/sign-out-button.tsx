'use client'

import { LogOut } from 'lucide-react'
import { logout } from '@/actions/auth'
import { clearOfflineCache } from '@/lib/push-client'

/** Sign out (same as the drawer/user menu: clears the offline page cache too). */
export function SignOutButton({ className = '' }: { className?: string }) {
  return (
    <form action={logout} onSubmit={clearOfflineCache}>
      <button type="submit" className={className}>
        <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
        Sign out
      </button>
    </form>
  )
}
