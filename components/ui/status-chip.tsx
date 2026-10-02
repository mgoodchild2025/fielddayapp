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
  full: 'bg-yellow-100 text-yellow-700',
}

/**
 * Event (league) lifecycle. `active` means "season in progress" here, not
 * "in good standing" as it does for registrations, so events get their own
 * tones: open for registration = green (go), in season = blue, completed =
 * purple. Every event-status pill uses these — via `kind="event"`, or
 * `eventStatusTone()` for pills with their own sizing.
 */
const EVENT_TONES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  registration_open: 'bg-green-100 text-green-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-400',
}

const NEUTRAL = 'bg-gray-100 text-gray-600'

export function eventStatusTone(status: string): string {
  return EVENT_TONES[status] ?? NEUTRAL
}

const EVENT_LABELS: Record<string, string> = {
  draft: 'Draft',
  registration_open: 'Registration open',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
}

export function eventStatusLabel(status: string): string {
  return EVENT_LABELS[status] ?? status.replace(/_/g, ' ')
}

export function StatusChip({ status, label, kind, className = '' }: {
  status: string
  /** Custom text; defaults to the status with underscores spaced. */
  label?: string
  /** `event` = a league/event lifecycle status (see EVENT_TONES). */
  kind?: 'event'
  className?: string
}) {
  const tone = kind === 'event' ? eventStatusTone(status) : TONES[status] ?? NEUTRAL
  const text = label ?? (kind === 'event' ? eventStatusLabel(status) : status.replace(/_/g, ' '))
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${tone} ${className}`}>
      {text}
    </span>
  )
}
