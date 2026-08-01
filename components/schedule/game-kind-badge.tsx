/**
 * Small pill indicating whether a game is a regular-season match, a pool
 * match, or a playoff game. Only meaningful when an event mixes kinds, so
 * callers pass `show` (typically "the schedule has pool and/or playoff games")
 * to gate it — a plain league with no pools/playoffs shows nothing.
 */
export function GameKindBadge({
  poolName,
  isPlayoff = false,
  show = true,
  className = '',
}: {
  poolName?: string | null
  isPlayoff?: boolean
  show?: boolean
  className?: string
}) {
  if (!show) return null

  let label = 'Regular Season'
  let color = 'bg-slate-100 text-slate-500'
  if (isPlayoff) {
    label = 'Playoff'
    color = 'bg-amber-100 text-amber-800'
  } else if (poolName) {
    label = poolName
    color = 'bg-indigo-50 text-indigo-700'
  }

  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${color} ${className}`}>
      {label}
    </span>
  )
}
