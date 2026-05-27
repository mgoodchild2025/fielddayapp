import Link from 'next/link'

type Tier = 'starter' | 'pro' | 'club'

interface Props {
  feature: string          // human-readable feature name, e.g. "SMS notifications"
  requiredTier: Tier       // minimum tier that unlocks this feature
  className?: string
}

const TIER_LABELS: Record<Tier, string> = {
  starter: 'Starter',
  pro:     'Pro',
  club:    'Club',
}

const TIER_COLORS: Record<Tier, string> = {
  starter: 'text-gray-600 bg-gray-100 border-gray-200',
  pro:     'text-blue-700 bg-blue-50 border-blue-200',
  club:    'text-emerald-700 bg-emerald-50 border-emerald-200',
}

/**
 * Inline indicator shown when a feature is locked behind a higher plan.
 * Renders a lock icon + short message + link to billing settings.
 *
 * Usage:
 *   {!canAccessSms && <UpgradePrompt feature="SMS notifications" requiredTier="pro" />}
 */
export function UpgradePrompt({ feature, requiredTier, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${TIER_COLORS[requiredTier]} ${className}`}>
      <span className="text-lg shrink-0" aria-hidden="true">🔒</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {feature} requires the <strong>{TIER_LABELS[requiredTier]}</strong> plan
        </p>
      </div>
      <Link
        href="/admin/settings/billing"
        className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        Upgrade →
      </Link>
    </div>
  )
}

/**
 * Compact inline badge variant — use inside table rows or next to buttons.
 */
export function UpgradeBadge({ requiredTier }: { requiredTier: Tier }) {
  return (
    <Link
      href="/admin/settings/billing"
      title={`Upgrade to ${TIER_LABELS[requiredTier]} to unlock`}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80 text-gray-600 bg-gray-100 border-gray-200"
    >
      🔒 {TIER_LABELS[requiredTier]}
    </Link>
  )
}
