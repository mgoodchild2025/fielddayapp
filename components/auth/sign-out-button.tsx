'use client'

import { LogOut } from 'lucide-react'
import { logout } from '@/actions/auth'
import { clearOfflineCache } from '@/lib/push-client'

/** Sign out (same as the drawer/user menu: clears the offline page cache too). */
export function SignOutButton({ className = '', next, label = 'Sign out' }: {
  className?: string
  /** Same-site path to land on after signing out (e.g. /login?redirect=…). */
  next?: string
  label?: string
}) {
  return (
    <form action={logout} onSubmit={clearOfflineCache}>
      {next && <input type="hidden" name="next" value={next} />}
      <button type="submit" className={className}>
        <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
        {label}
      </button>
    </form>
  )
}
