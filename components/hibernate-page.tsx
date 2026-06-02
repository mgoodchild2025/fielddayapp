import type { OrgBranding } from '@/types/database'

interface Props {
  orgName: string
  resumeAt: string | null  // ISO 8601 timestamp or null
  branding: OrgBranding | null
  timezone?: string
}

export function HibernatePage({ orgName, resumeAt, branding, timezone = 'America/Toronto' }: Props) {
  const logoUrl = branding?.logo_url ?? null
  const primaryColor = branding?.primary_color ?? '#f97316'

  const resumeFormatted = resumeAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        timeZone: timezone,
      }).format(new Date(resumeAt))
    : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo or org initial */}
        {logoUrl ? (
          <img src={logoUrl} alt={orgName} className="h-16 w-auto mx-auto object-contain" />
        ) : (
          <div
            className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold"
            style={{ backgroundColor: primaryColor }}
          >
            {orgName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Snowflake icon */}
        <div className="text-5xl" aria-hidden="true">❄️</div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {orgName} is in the off-season
          </h1>
          <p className="text-gray-500 text-base leading-relaxed">
            {resumeFormatted
              ? `We'll be back and ready to play on ${resumeFormatted}. See you then!`
              : 'We\'re taking a break and will be back soon. Check back later!'}
          </p>
        </div>

        {/* Resume date chip */}
        {resumeFormatted && (
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm">
            <span>📅</span>
            <span>Returns {resumeFormatted}</span>
          </div>
        )}

        {/* Organizer sign-in — lets an admin reach the panel to resume the account */}
        <p className="text-sm pt-2">
          <a
            href="/login?redirect=/admin/settings/billing"
            className="text-gray-400 underline hover:text-gray-600 transition-colors"
          >
            Organizer? Sign in
          </a>
        </p>

        {/* Footer */}
        <p className="text-xs text-gray-400 pt-4">
          Powered by{' '}
          <a
            href="https://fielddayapp.ca"
            className="underline hover:text-gray-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Fieldday
          </a>
        </p>
      </div>
    </div>
  )
}
