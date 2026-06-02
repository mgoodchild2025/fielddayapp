/**
 * POST /api/export/org-data/request
 *
 * Creates an export job and immediately triggers async processing.
 * Returns { jobId } to the client for status polling.
 *
 * Rate limit: max 3 export requests per org per 24 hours.
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_HOURS = 24

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers()
    const org = await getCurrentOrg(headersList)
    const supabase = await createServerClient()
    const db = createServiceRoleClient()

    // Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Must be org_admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (db as any)
      .from('org_members')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'org_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Rate limit: count exports in the last 24 hours
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any)
      .from('org_export_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .gte('requested_at', windowStart)

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      const resetAt = new Date(Date.now() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000)
      return NextResponse.json({
        error: `Maximum of ${RATE_LIMIT_MAX} exports per ${RATE_LIMIT_WINDOW_HOURS} hours. Try again after ${resetAt.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC.`,
        reset_at: resetAt.toISOString(),
      }, { status: 429 })
    }

    // Get IP for audit log
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? null

    // Create job record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error: jobError } = await (db as any)
      .from('org_export_jobs')
      .insert({
        organization_id: org.id,
        requested_by: user.id,
        status: 'pending',
        ip_address: ip,
      })
      .select('id')
      .single()

    if (jobError || !job) {
      console.error('[export/request] failed to create job:', jobError)
      return NextResponse.json({ error: 'Failed to create export job' }, { status: 500 })
    }

    await recordAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      actorLabel: user.email ?? null,
      action: AUDIT_ACTIONS.DATA_EXPORT_GENERATED,
      targetType: 'export_job',
      targetId: job.id,
      metadata: { ip: ip ?? null },
    })

    // Fire-and-forget: trigger the process endpoint
    // Works on Railway (persistent server) — the fetch runs independently
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const processUrl = `${origin}/api/export/org-data/process?jobId=${job.id}`

    fetch(processUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET ?? ''}`,
        'x-org-id': org.id,
      },
    }).catch(err => {
      console.error('[export/request] failed to trigger process:', err)
    })

    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    console.error('[export/request] error:', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
