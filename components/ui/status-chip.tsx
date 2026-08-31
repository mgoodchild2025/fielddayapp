/**
 * One status pill for the whole app. Semantic tone comes from the status
 * value, so paid/pending/cancelled read the same on every screen instead of
 * each table styling its own. Unknown statuses fall back to neutral gray.
 */

const TONES: Record<string, string> = {
  // money
  paid: 'bg-green-100 text-green-700',
  manual: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  unpaid: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-purple-100 text-purple-700',
  free: 'bg-gray-100 text-gray-400',
  // registrations / general lifecycle
  active: 'bg-green-100 text-green-700',
  confirmed: 'bg-green-100 text-green-700',
  waitlisted: 'bg-orange-100 text-orange-700',
  withdrawn: 'bg-gray-100 text-gray-500',
  // events / games
  registration_open: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
  scheduled: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
  postponed: 'bg-amber-100 text-amber-700',
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-100 text-gray-400',
  open: 'bg-green-100 text-green-700',
}

export function StatusChip({ status, label, className = '' }: {
  status: string
  /** Custom text; defaults to the status with underscores spaced. */
  label?: string
  className?: string
}) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${TONES[status] ?? 'bg-gray-100 text-gray-600'} ${className}`}>
      {label ?? status.replace(/_/g, ' ')}
    </span>
  )
}
