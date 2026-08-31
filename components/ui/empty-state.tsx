import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

/**
 * The app-wide empty state: an icon, one plain sentence, and (when there's an
 * obvious next step) one action — instead of a bare grey sentence.
 */
export function EmptyState({ icon: Icon, title, hint, action, className = '' }: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: { href: string; label: string }
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-dashed bg-white px-6 py-10 text-center ${className}`}>
      {Icon && (
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
          <Icon className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-400 max-w-sm mx-auto">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
