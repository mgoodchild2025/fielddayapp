/**
 * Cleanup Exports Cron
 *
 * Runs daily. Deletes expired export archives from Supabase Storage
 * and marks the corresponding jobs as 'expired'.
 *
 * Schedule: daily (e.g. 4 AM UTC on cron-job.org)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceRoleClient()
  const now = new Date()
  const results: string[] = []

  try {
    // Find ready jobs past their expiry date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: expiredJobs } = await (db as any)
      .from('org_export_jobs')
      .select('id, storage_path, organization_id')
      .eq('status', 'ready')
      .lt('expires_at', now.toISOString())

    for (const job of expiredJobs ?? []) {
      try {
        // Delete from storage
        if (job.storage_path) {
          const { error: storageErr } = await db.storage
            .from('tenant-exports')
            .remove([job.storage_path])
          if (storageErr) {
            results.push(`⚠ storage delete failed for job ${job.id}: ${storageErr.message}`)
          }
        }

        // Mark as expired
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from('org_export_jobs')
          .update({ status: 'expired', storage_path: null })
          .eq('id', job.id)

        results.push(`✓ expired job ${job.id}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push(`✗ failed job ${job.id}: ${msg}`)
      }
    }

    // Also clean up failed jobs older than 30 days (housekeeping)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any)
      .from('org_export_jobs')
      .delete()
      .eq('status', 'failed')
      .lt('requested_at', thirtyDaysAgo)
      .select('id', { count: 'exact', head: true })

    if ((count ?? 0) > 0) {
      results.push(`✓ pruned ${count} old failed jobs`)
    }

    return NextResponse.json({
      message: 'Cleanup complete',
      expired: (expiredJobs ?? []).length,
      results,
    })
  } catch (err) {
    console.error('[cleanup-exports] error:', err)
    return NextResponse.json({ error: 'Cleanup failed', results }, { status: 500 })
  }
}
