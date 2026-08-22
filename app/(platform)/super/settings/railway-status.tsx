import { checkRailwayToken } from '@/lib/railway'

/**
 * Railway integration status (custom-domain provisioning). Server-rendered on
 * each visit: a live check against the configured token, so rotating the
 * token in Railway variables and redeploying is verifiable from this page.
 */
export async function RailwayStatus() {
  const status = await checkRailwayToken()
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-1">
        🚂 Railway Integration
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Provisions TLS for org custom domains (lib/railway.ts). Checked live against the configured token.
      </p>
      <div className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm ${
        status.ok
          ? 'bg-green-500/10 border border-green-500/30 text-green-300'
          : 'bg-red-500/10 border border-red-500/30 text-red-300'
      }`}>
        <span aria-hidden>{status.ok ? '✓' : '✕'}</span>
        <p>{status.detail}</p>
      </div>
      {!status.ok && (
        <p className="mt-3 text-xs text-gray-500">
          Fix: Railway dashboard → Account Settings → Tokens → create a token scoped to the Fieldday workspace →
          set it as <code className="text-gray-400">RAILWAY_API_TOKEN</code> in the service&apos;s Variables (triggers a
          redeploy) → reload this page. Update <code className="text-gray-400">.env.local</code> too for local dev.
        </p>
      )}
    </div>
  )
}
