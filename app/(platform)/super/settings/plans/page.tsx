import { getPlanConfigs } from '@/actions/plan-config'
import { FEATURE_GROUPS } from '@/lib/features'
import { PlanConfigEditor } from './plan-config-editor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plan Configuration — Fieldday' }

const TIERS = ['starter', 'pro', 'club', 'internal'] as const

export default async function PlanConfigPage() {
  const rows = await getPlanConfigs()

  // Build a lookup map: tier → feature → { enabled, limit_value }
  const configMap: Record<string, Record<string, { enabled: boolean; limit_value: number | null }>> = {}
  for (const tier of TIERS) configMap[tier] = {}
  for (const row of rows) {
    if (!configMap[row.tier]) configMap[row.tier] = {}
    configMap[row.tier][row.feature] = { enabled: row.enabled, limit_value: row.limit_value }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Plan Configuration</h1>
        <p className="text-gray-400 text-sm mt-1">
          Configure which features are available at each subscription tier. Changes take effect within 60 seconds.
        </p>
      </div>

      <PlanConfigEditor
        tiers={[...TIERS]}
        featureGroups={FEATURE_GROUPS}
        configMap={configMap}
      />
    </div>
  )
}
