import { getSignupsEnabled } from '@/actions/platform-settings'
import { ToggleSignups } from './toggle-signups'

export const metadata = { title: 'Platform Settings — Fieldday' }

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

export default async function PlatformSettingsPage() {
  const signupsEnabled = await getSignupsEnabled()
  const signupUrl = `https://app.${PLATFORM_DOMAIN}/signup`

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-8">Platform Settings</h1>

      <div className="space-y-4">
        {/* Sign-up toggle */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-4">
            Public Sign-ups
          </h2>
          <ToggleSignups enabled={signupsEnabled} />
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-1">Sign-up page URL</p>
            <a
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-mono hover:underline"
            >
              {signupUrl} ↗
            </a>
          </div>
        </div>

        {/* Platform info */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-4">
            Platform
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-400">Domain</dt>
              <dd className="text-gray-200 font-mono">{PLATFORM_DOMAIN}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Environment</dt>
              <dd className="text-gray-200">{process.env.NODE_ENV}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
