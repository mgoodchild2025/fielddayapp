/**
 * Shown in the admin layout when an org_admin or platform_admin is within
 * their 14-day grace period for MFA enrollment.
 * Disappears once the user sets up MFA (grace period is no longer evaluated).
 */

interface Props {
  daysLeft: number
}

export function MfaGraceBanner({ daysLeft }: Props) {
  const urgent = daysLeft <= 3
  return (
    <div
      className={`px-4 py-2.5 flex items-center gap-3 text-sm ${
        urgent
          ? 'bg-red-600 text-white'
          : 'bg-amber-500 text-white'
      }`}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span>
        <strong>Set up two-factor authentication.</strong>{' '}
        Your account requires 2FA.{' '}
        {daysLeft > 0
          ? `You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining before access is restricted.`
          : 'Your grace period ends today.'}
      </span>
      <a
        href="/mfa/setup"
        className={`ml-auto shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
          urgent
            ? 'bg-white text-red-700 hover:bg-red-50'
            : 'bg-white text-amber-700 hover:bg-amber-50'
        }`}
      >
        Set up now →
      </a>
    </div>
  )
}
