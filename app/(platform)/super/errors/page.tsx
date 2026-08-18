import { createServiceRoleClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface ErrorRow {
  id: string
  created_at: string
  digest: string
  message: string
  stack: string | null
  path: string | null
  method: string | null
  router_kind: string | null
  organization_id: string | null
}

interface ErrorGroup {
  digest: string
  message: string
  stack: string | null
  path: string | null
  routerKind: string | null
  count: number
  firstSeen: string
  lastSeen: string
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Toronto',
  })
}

export default async function SuperErrorsPage() {
  const db = createServiceRoleClient()

  // Last 7 days, newest first; grouped by digest below.
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()

  const { data, error } = await db
    .from('error_logs')
    .select('id, created_at, digest, message, stack, path, method, router_kind, organization_id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)

  // Table missing → migration 172 not applied yet.
  const tableMissing = !!error
  const rows: ErrorRow[] = data ?? []

  const groups = new Map<string, ErrorGroup>()
  for (const r of rows) {
    const g = groups.get(r.digest)
    if (g) {
      g.count++
      if (r.created_at < g.firstSeen) g.firstSeen = r.created_at
      if (r.created_at > g.lastSeen) g.lastSeen = r.created_at
    } else {
      groups.set(r.digest, {
        digest: r.digest,
        message: r.message,
        stack: r.stack,
        path: r.path,
        routerKind: r.router_kind,
        count: 1,
        firstSeen: r.created_at,
        lastSeen: r.created_at,
      })
    }
  }
  const grouped = [...groups.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold">Server Errors</h1>
        <p className="text-sm text-gray-500">
          Last 7 days · {rows.length} occurrence{rows.length !== 1 ? 's' : ''} · {grouped.length} unique
        </p>
      </div>

      {tableMissing && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          The <code>error_logs</code> table doesn&apos;t exist yet — apply migration{' '}
          <code>172_error_logs.sql</code> in the Supabase SQL editor to start capturing errors.
        </div>
      )}

      {!tableMissing && grouped.length === 0 && (
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
          No server errors in the last 7 days. 🎉
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <details key={g.digest} className="bg-white rounded-xl border overflow-hidden">
            <summary className="px-5 py-4 cursor-pointer hover:bg-gray-50 flex items-start gap-3">
              <span className="shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                ×{g.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm text-gray-900 truncate">{g.message}</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {g.routerKind ?? 'unknown'} · {g.path ?? 'unknown path'} · last {fmt(g.lastSeen)}
                  {g.count > 1 && <> · first {fmt(g.firstSeen)}</>}
                  {' · '}<code className="text-gray-400">{g.digest}</code>
                </span>
              </span>
            </summary>
            {g.stack && (
              <pre className="px-5 py-4 border-t bg-gray-50 text-[11px] leading-relaxed overflow-x-auto text-gray-700">
                {g.stack}
              </pre>
            )}
          </details>
        ))}
      </div>
    </div>
  )
}
