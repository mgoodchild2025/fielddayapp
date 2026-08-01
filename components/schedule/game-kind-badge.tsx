/**
 * Small pill indicating whether a game is a regular-season match or a pool
 * match. Only meaningful when an event mixes the two, so callers pass
 * `show` (typically "the event has at least one pool game") to gate it —
 * a plain league with no pools shows nothing.
 *
 * Playoff games live in the bracket, not the schedule/results lists, so they
 * are not represented here.
 */
export function GameKindBadge({
  poolName,
  show = true,
  className = '',
}: {
  poolName?: string | null
  show?: boolean
  className?: string
}) {
  if (!show) return null
  const isPool = !!poolName
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
        isPool ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'
      } ${className}`}
    >
      {isPool ? poolName : 'Regular Season'}
    </span>
  )
}
