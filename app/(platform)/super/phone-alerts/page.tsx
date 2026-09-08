import { createServiceRoleClient } from '@/lib/supabase/service'
import { pushConfigured } from '@/lib/push'

export const dynamic = 'force-dynamic'

/**
 * Super console → Phone Alerts: how far the installed app and push have
 * spread, per org and platform-wide. Sources: pwa_launch_logs (one row per
 * member per day, standalone vs tab), push_subscriptions (reach + delivery
 * failures), org_members (denominator).
 */

const DAYS = 30
const FAIL_DAYS = 7

interface OrgStat {
  id: string
  name: string
  slug: string
  status: string
  members: number
  active: number       // distinct members who opened the site in the window
  installed: number    // …of whom at least one launch was from the home screen
  reachable: number    // distinct members with ≥1 push subscription
  subs: number
  failed: number       // subscriptions with a delivery failure in FAIL_DAYS
  platforms: Record<string, number>  // installed members by platform
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—'
}

/** Query windows, computed outside the component body (render must stay pure). */
function windows(now = Date.now()) {
  return {
    since: new Date(now - DAYS * 86400_000).toISOString().slice(0, 10),
    failSince: new Date(now - FAIL_DAYS * 86400_000).toISOString(),
  }
}

export default async function PhoneAlertsPage() {
  const db = createServiceRoleClient()
  const { since, failSince } = windows()

  const [{ data: orgs }, { data: members }, { data: subs }, { data: launches }] = await Promise.all([
    db.from('organizations').select('id, name, slug, status').neq('status', 'suspended').order('name'),
    db.from('org_members').select('organization_id, user_id').limit(20000),
    db.from('push_subscriptions').select('organization_id, user_id, failed_at').limit(20000),
    db.from('pwa_launch_logs').select('organization_id, user_id, standalone, platform, day').gte('day', since).limit(50000),
  ])

  const stats = new Map<string, OrgStat>()
  for (const o of orgs ?? []) {
    stats.set(o.id, { id: o.id, name: o.name, slug: o.slug, status: o.status, members: 0, active: 0, installed: 0, reachable: 0, subs: 0, failed: 0, platforms: {} })
  }
  const bump = (orgId: string, fn: (s: OrgStat) => void) => { const s = stats.get(orgId); if (s) fn(s) }

  for (const m of members ?? []) bump(m.organization_id, (s) => { s.members++ })

  const reachableKeys = new Set<string>()
  for (const sub of subs ?? []) {
    bump(sub.organization_id, (s) => {
      s.subs++
      if (sub.failed_at && sub.failed_at >= failSince) s.failed++
    })
    reachableKeys.add(`${sub.organization_id}:${sub.user_id}`)
  }
  for (const key of reachableKeys) bump(key.split(':')[0], (s) => { s.reachable++ })

  // Per member: active if any launch; installed if any standalone launch; platform = latest standalone launch's platform.
  const perMember = new Map<string, { standalone: boolean; platform: string; day: string }>()
  for (const l of launches ?? []) {
    const key = `${l.organization_id}:${l.user_id}`
    const cur = perMember.get(key)
    if (!cur) { perMember.set(key, { standalone: l.standalone, platform: l.platform, day: l.day }); continue }
    if (l.standalone && (!cur.standalone || l.day > cur.day)) { cur.standalone = true; cur.platform = l.platform; cur.day = l.day }
  }
  for (const [key, v] of perMember) {
    bump(key.split(':')[0], (s) => {
      s.active++
      if (v.standalone) { s.installed++; s.platforms[v.platform] = (s.platforms[v.platform] ?? 0) + 1 }
    })
  }

  const rows = [...stats.values()].sort((a, b) => b.installed - a.installed || b.reachable - a.reachable || a.name.localeCompare(b.name))
  const total = rows.reduce((acc, s) => ({
    members: acc.members + s.members, active: acc.active + s.active, installed: acc.installed + s.installed,
    reachable: acc.reachable + s.reachable, subs: acc.subs + s.subs, failed: acc.failed + s.failed,
  }), { members: 0, active: 0, installed: 0, reachable: 0, subs: 0, failed: 0 })
  const platformTotals = rows.reduce<Record<string, number>>((acc, s) => {
    for (const [p, n] of Object.entries(s.platforms)) acc[p] = (acc[p] ?? 0) + n
    return acc
  }, {})
  const configured = pushConfigured()

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Phone Alerts</h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${configured ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
          {configured ? 'Push configured' : 'VAPID keys missing'}
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Install and push adoption across orgs. &ldquo;Active&rdquo; = members who opened the site in the last {DAYS} days;
        &ldquo;Installed&rdquo; = those who opened it from the home screen at least once in that window.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
        {[
          { label: 'Members', value: String(total.members), color: 'text-white' },
          { label: `Active ${DAYS}d`, value: String(total.active), color: 'text-white' },
          { label: 'Installed', value: `${total.installed}`, sub: pct(total.installed, total.active) + ' of active', color: 'text-green-400' },
          { label: 'Push reachable', value: String(total.reachable), sub: pct(total.reachable, total.members) + ' of members', color: 'text-blue-400' },
          { label: 'Subscriptions', value: String(total.subs), color: 'text-white' },
          { label: `Failed ${FAIL_DAYS}d`, value: String(total.failed), color: total.failed > 0 ? 'text-yellow-400' : 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {total.installed > 0 && (
        <p className="text-xs text-gray-400 mb-4">
          Installed by platform:{' '}
          {Object.entries(platformTotals).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(' · ')}
        </p>
      )}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Organization', 'Members', `Active ${DAYS}d`, 'Installed', 'Push reachable', 'Subscriptions', `Failed ${FAIL_DAYS}d`, 'Platforms'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap">
                  <span className="font-medium text-gray-900">{s.name}</span>
                  <span className="block text-xs text-gray-400">{s.slug}</span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-700">{s.members}</td>
                <td className="px-5 py-3 text-sm text-gray-700">{s.active}</td>
                <td className="px-5 py-3 text-sm text-gray-700">
                  {s.installed} <span className="text-gray-400 text-xs">{pct(s.installed, s.active)}</span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-700">
                  {s.reachable} <span className="text-gray-400 text-xs">{pct(s.reachable, s.members)}</span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-700">{s.subs}</td>
                <td className={`px-5 py-3 text-sm ${s.failed > 0 ? 'text-yellow-700 font-medium' : 'text-gray-400'}`}>{s.failed}</td>
                <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {Object.entries(s.platforms).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(' · ') || '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-400">No organizations.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
