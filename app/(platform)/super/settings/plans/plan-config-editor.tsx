'use client'

import { useState, useTransition } from 'react'
import { savePlanConfigs } from '@/actions/plan-config'
import type { FeatureGroup } from '@/lib/features'

type Tier = 'starter' | 'pro' | 'club' | 'internal'
type CellValue = { enabled: boolean; limit_value: number | null }
type ConfigMap = Record<string, Record<string, CellValue>>

const TIER_LABELS: Record<Tier, string> = {
  starter:  'Starter',
  pro:      'Pro',
  club:     'Club',
  internal: 'Internal',
}

const TIER_COLORS: Record<Tier, string> = {
  starter:  'text-gray-300',
  pro:      'text-blue-400',
  club:     'text-emerald-400',
  internal: 'text-purple-400',
}

interface Props {
  tiers: Tier[]
  featureGroups: FeatureGroup[]
  configMap: ConfigMap
}

export function PlanConfigEditor({ tiers, featureGroups, configMap }: Props) {
  const [local, setLocal] = useState<ConfigMap>(() =>
    JSON.parse(JSON.stringify(configMap))  // deep clone
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function setEnabled(tier: string, feature: string, enabled: boolean) {
    setSaved(false)
    setLocal((prev) => ({
      ...prev,
      [tier]: { ...prev[tier], [feature]: { ...prev[tier]?.[feature], enabled } },
    }))
  }

  function setLimit(tier: string, feature: string, value: string) {
    setSaved(false)
    const num = value === '' ? null : parseInt(value, 10)
    setLocal((prev) => ({
      ...prev,
      [tier]: { ...prev[tier], [feature]: { ...prev[tier]?.[feature], limit_value: isNaN(num as number) ? null : num } },
    }))
  }

  function setUnlimited(tier: string, feature: string, unlimited: boolean) {
    setSaved(false)
    setLocal((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [feature]: {
          ...prev[tier]?.[feature],
          enabled: !unlimited,        // when unlimited=true, enabled=false means "no cap"
          limit_value: unlimited ? null : (prev[tier]?.[feature]?.limit_value ?? 0),
        },
      },
    }))
  }

  function handleSave() {
    setError(null)
    const rows: { tier: string; feature: string; enabled: boolean; limit_value: number | null }[] = []
    for (const tier of tiers) {
      for (const group of featureGroups) {
        for (const f of group.features) {
          const cell = local[tier]?.[f.key]
          if (cell !== undefined) {
            rows.push({ tier, feature: f.key, enabled: cell.enabled, limit_value: cell.limit_value ?? null })
          }
        }
      }
    }
    startTransition(async () => {
      const result = await savePlanConfigs(rows)
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div className="space-y-6">
      {featureGroups.map((group) => (
        <div key={group.label} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          {/* Group header */}
          <div className="px-5 py-3 border-b border-gray-700 flex items-center">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex-1">
              {group.label}
            </h2>
            {/* Tier column headers — only on first group or repeat */}
            <div className="flex gap-0">
              {tiers.map((tier) => (
                <div key={tier} className={`w-24 text-center text-xs font-bold ${TIER_COLORS[tier]}`}>
                  {TIER_LABELS[tier]}
                </div>
              ))}
            </div>
          </div>

          {/* Feature rows */}
          {group.features.map((feat, idx) => (
            <div
              key={feat.key}
              className={`flex items-center px-5 py-3 ${idx < group.features.length - 1 ? 'border-b border-gray-700/50' : ''}`}
            >
              {/* Label + description */}
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-medium text-gray-200">{feat.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{feat.description}</p>
              </div>

              {/* Tier cells */}
              <div className="flex gap-0 shrink-0">
                {tiers.map((tier) => {
                  const cell = local[tier]?.[feat.key] ?? { enabled: false, limit_value: null }

                  if (feat.type === 'limit') {
                    // For limit features: "Unlimited" checkbox + number input
                    const isUnlimited = !cell.enabled || cell.limit_value === null
                    return (
                      <div key={tier} className="w-24 flex flex-col items-center gap-1">
                        <label className="flex items-center gap-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isUnlimited}
                            onChange={(e) => setUnlimited(tier, feat.key, e.target.checked)}
                            className="w-3 h-3 rounded accent-emerald-500"
                          />
                          <span className="text-[10px] text-gray-400">∞</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={isUnlimited ? '' : (cell.limit_value ?? '')}
                          onChange={(e) => setLimit(tier, feat.key, e.target.value)}
                          disabled={isUnlimited}
                          placeholder="—"
                          className="w-16 text-center text-xs bg-gray-700 border border-gray-600 rounded px-1 py-1 text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        {feat.unit === 'bps' && !isUnlimited && (
                          <span className="text-[10px] text-gray-500">
                            {((cell.limit_value ?? 0) / 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )
                  }

                  // Boolean toggle
                  return (
                    <div key={tier} className="w-24 flex items-center justify-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cell.enabled}
                        onClick={() => setEnabled(tier, feat.key, !cell.enabled)}
                        className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                          cell.enabled ? 'bg-emerald-500' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            cell.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Save bar */}
      <div className="sticky bottom-6 flex items-center justify-between bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 shadow-2xl">
        <div className="text-sm">
          {error && <span className="text-red-400">{error}</span>}
          {saved && !error && <span className="text-emerald-400">✓ Changes saved</span>}
          {!saved && !error && <span className="text-gray-500">Unsaved changes will be lost if you navigate away</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
