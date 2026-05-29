import { getSignupsEnabled, getGlobalMaintenance, getPlatformAlerts } from '@/actions/platform-settings'
import { ToggleSignups } from './toggle-signups'
import { GlobalMaintenanceForm } from '@/components/platform/global-maintenance-form'
import { PlatformAlertsForm } from './platform-alerts-form'

export const metadata = { title: 'Platform Settings — Fieldday' }

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'fielddayapp.ca'

export default async function PlatformSettingsPage() {
  const [signupsEnabled, globalMaintenance, platformAlerts] = await Promise.all([
    getSignupsEnabled(),
    getGlobalMaintenance(),
    getPlatformAlerts(),
  ])
  const signupUrl = `https://app.${PLATFORM_DOMAIN}/signup`

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-8">Platform Settings</h1>

      {/* Global maintenance active banner */}
      {globalMaintenance.enabled && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3">
          <span className="text-amber-400 text-lg">⚠</span>
          <p className="text-sm text-amber-300 font-medium">
            Global maintenance mode is <strong>ACTIVE</strong> — all org sites are showing the maintenance page.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Global maintenance */}
        <div className={`bg-gray-800 rounded-xl p-6 ${globalMaintenance.enabled ? 'border-2 border-amber-500/50' : 'border border-gray-700'}`}>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-1">
            ⚠ Maintenance Mode
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Use during deployments or migrations. Disables all org sites at once.
          </p>
          <GlobalMaintenanceForm
            initialEnabled={globalMaintenance.enabled}
            initialMessage={globalMaintenance.message}
            initialUntil={globalMaintenance.until}
          />
        </div>

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

        {/* Platform alerts */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-1">
            Platform Alerts
          </h2>
          <p className="text-xs text-gray-500 mb-5">
            Choose which events trigger an email alert to your team.
          </p>
          <PlatformAlertsForm initial={platformAlerts} />
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
