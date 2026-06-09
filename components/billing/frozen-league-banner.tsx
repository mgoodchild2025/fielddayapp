import Link from 'next/link'
import { Lock } from 'lucide-react'

interface Props {
  graceDaysLeft?: number | null  // null = grace not active (enforcement is live)
}

/**
 * Shown at the top of admin league pages when a league is frozen.
 *
 * Frozen: the org has more active leagues than their plan allows and the 14-day
 * grace period has expired. The oldest N leagues are protected; this one is
 * beyond the cap. Admin writes are blocked until the org upgrades or archives
 * a protected league.
 *
 * During grace (graceDaysLeft !== null): warning only — writes still allowed.
 */
export function FrozenLeagueBanner({ graceDaysLeft }: Props) {
  if (graceDaysLeft !== null && graceDaysLeft !== undefined) {
    // Still in grace — amber warning
    return (
      <div className="w-full px-4 py-3 mb-4 rounded-lg text-sm bg-amber-50 border border-amber-200 flex items-start gap-3">
        <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-amber-800">
            This league exceeds your plan&apos;s active league limit
          </p>
          <p className="text-amber-700 mt-0.5">
            You have {graceDaysLeft} day{graceDaysLeft !== 1 ? 's' : ''} before this league
            becomes read-only. Upgrade your plan or archive another league to avoid
            disruption.
          </p>
        </div>
        <Link
          href="/admin/settings/billing"
          className="shrink-0 rounded bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          Upgrade →
        </Link>
      </div>
    )
  }

  // Grace expired — red lock-out
  return (
    <div className="w-full px-4 py-3 mb-4 rounded-lg text-sm bg-red-50 border border-red-200 flex items-start gap-3">
      <Lock className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-red-800">
          This league is frozen — admin writes are disabled
        </p>
        <p className="text-red-700 mt-0.5">
          Your active league count exceeds your plan limit. This league is read-only.
          Upgrade your plan, or archive one of your other active leagues to unfreeze this one.
          Player-facing pages and existing data are unaffected.
        </p>
      </div>
      <Link
        href="/admin/settings/billing"
        className="shrink-0 rounded bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
      >
        Upgrade →
      </Link>
    </div>
  )
}
