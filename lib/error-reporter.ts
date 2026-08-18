import { createHash } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { sendErrorAlert } from '@/lib/platform-alerts'

/**
 * Server-side error reporting — the sink for instrumentation.ts's
 * onRequestError hook. Writes every uncaught server error to the error_logs
 * table and emails the platform team, throttled to once per unique error
 * (digest) per ALERT_QUIET_HOURS.
 *
 * MUST never throw: a failing reporter would mask the original error. Every
 * step is best-effort — if the error_logs table doesn't exist yet (migration
 * 172 not applied), reporting silently degrades to console.error.
 */

const ALERT_QUIET_HOURS = 6
const RETENTION_DAYS = 60

export interface ReportedRequest {
  path?: string
  method?: string
  headers?: Record<string, string | string[] | undefined>
}

export interface ReportedContext {
  routerKind?: string
  routePath?: string
  routeType?: string
}

/** Stable hash grouping repeats of the same error across requests. */
function errorDigest(message: string, stack: string | null): string {
  // Top 3 stack frames identify the throw site without churning on deep
  // caller variation; strip line/col numbers so rebuilds don't split groups.
  const frames = (stack ?? '')
    .split('\n')
    .slice(1, 4)
    .map((l) => l.trim().replace(/:\d+:\d+\)?$/, ''))
    .join('|')
  return createHash('sha1').update(`${message}|${frames}`).digest('hex').slice(0, 16)
}

function headerValue(headers: ReportedRequest['headers'], name: string): string | null {
  const v = headers?.[name]
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

export async function reportServerError(
  error: unknown,
  request: ReportedRequest = {},
  context: ReportedContext = {},
): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const message = (err.message || 'Unknown error').slice(0, 2000)
    const stack = err.stack?.slice(0, 8000) ?? null
    const digest = errorDigest(message, stack)
    const path = context.routePath ?? request.path ?? null

    // Always visible in container logs even if everything below fails.
    console.error(`[server-error] ${digest} ${context.routerKind ?? ''} ${path ?? ''}: ${message}`)

    const db = createServiceRoleClient()

    // Alert throttle: only email when this digest hasn't fired recently.
    // Checked BEFORE inserting the new row so the current occurrence doesn't
    // suppress its own alert.
    let shouldAlert = false
    try {
      const since = new Date(Date.now() - ALERT_QUIET_HOURS * 3600_000).toISOString()

      const { data: recent, error: qErr } = await db
        .from('error_logs')
        .select('id')
        .eq('digest', digest)
        .gte('created_at', since)
        .limit(1)
      shouldAlert = !qErr && (recent?.length ?? 0) === 0
    } catch { /* table may not exist yet */ }


    await db.from('error_logs').insert({
      digest,
      message,
      stack,
      path,
      method: request.method ?? null,
      router_kind: context.routerKind ?? null,
      organization_id: headerValue(request.headers, 'x-org-id'),
      user_agent: headerValue(request.headers, 'user-agent')?.slice(0, 500) ?? null,
    })

    if (shouldAlert) {
      await sendErrorAlert(
        `Server error — ${message.slice(0, 80)}`,
        `<div style="font-family:sans-serif;max-width:640px;color:#111;">
           <h2 style="color:#b91c1c;">Server error</h2>
           <p><strong>${escapeHtml(message)}</strong></p>
           <p style="color:#6b7280;font-size:13px;">
             ${escapeHtml(context.routerKind ?? 'unknown')} · ${escapeHtml(path ?? 'unknown path')} · digest ${digest}<br/>
             Repeats within ${ALERT_QUIET_HOURS}h are logged without another email — see /super/errors.
           </p>
           ${stack ? `<pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:11px;overflow-x:auto;">${escapeHtml(stack.slice(0, 1500))}</pre>` : ''}
         </div>`,
      )

      // Opportunistic retention cleanup — runs at most once per digest per
      // quiet window, so it adds no per-request cost.
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString()

      await db.from('error_logs').delete().lt('created_at', cutoff)
    }
  } catch (reporterErr) {
    // Never let the reporter mask the original failure.
    console.error('[error-reporter] failed:', reporterErr)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
