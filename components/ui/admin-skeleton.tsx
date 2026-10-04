// Loading placeholder for admin pages (rendered by admin loading.tsx files).
// The admin shell — sidebar, top bar, an event's tabs — stays put; only the
// content area shows these shapes, so a tap on gym wifi visibly registers
// instead of the old page sitting there for a second or more.

const Bar = ({ className = '' }: { className?: string }) => (
  <div className={`rounded-md bg-gray-200/80 ${className}`} />
)

export function AdminSkeleton({ label, variant = 'list' }: { label: string; variant?: 'list' | 'cards' }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <Bar className="h-7 w-48" />
        {variant === 'cards' ? (
          <div className="space-y-3">
            <Bar className="h-11 w-full rounded-lg" />
            <Bar className="h-36 rounded-xl" />
            <Bar className="h-36 rounded-xl" />
            <Bar className="h-36 rounded-xl" />
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-10" />
            <Bar className="h-10" />
            <Bar className="h-10" />
            <Bar className="h-10" />
          </div>
        )}
      </div>
    </div>
  )
}
