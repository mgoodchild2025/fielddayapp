import type { OrgBranding } from '@/types/database'

interface Props {
  message: string | null
  until: string | null   // ISO 8601 timestamp string
  branding: OrgBranding | null
  timezone?: string
}

export function MaintenancePage({ message, until, branding, timezone = 'America/Toronto' }: Props) {
  const logoUrl = branding?.logo_url ?? null

  const untilFormatted = until
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
        timeZone: timezone,
      }).format(new Date(until))
    : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo */}
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            className="h-16 w-auto mx-auto object-contain"
          />
        )}

        {/* Icon */}
        <div className="text-5xl">🔧</div>

        {/* Heading */}
        <div className="space-y-2">
          <h1
            className="text-3xl font-bold text-gray-900"
            style={{ fontFamily: 'var(--brand-heading-font, sans-serif)' }}
          >
            We&apos;ll be right back
          </h1>
          <p className="text-gray-500 text-base leading-relaxed">
            {message ?? "We're making some improvements. The site will be back online shortly."}
          </p>
        </div>

        {/* Expected return time */}
        {untilFormatted && (
          <p className="text-sm text-gray-400">
            Expected back: <span className="font-medium text-gray-600">{untilFormatted}</span>
          </p>
        )}

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">
            Thank you for your patience.
          </p>
        </div>
      </div>
    </div>
  )
}
