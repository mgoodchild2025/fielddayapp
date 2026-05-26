/**
 * GET /api/export/org-data/status
 *
 * Returns the most recent export job for the current org.
 * Used by the UI to poll for job completion.
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

export async function GET(_req: NextRequest) {
  try {
    const headersList = await headers()
    const org = await getCurrentOrg(headersList)
    const supabase = await createServerClient()
    const db = createServiceRoleClient()

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

    // Get the most recent job for this org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job } = await (db as any)
      .from('org_export_jobs')
      .select('id, status, archive_size_bytes, error_message, requested_at, completed_at, expires_at, downloaded_at')
      .eq('organization_id', org.id)
      .order('requested_at', { ascending: false })
      .limit(1)
      .single()

    if (!job) {
      return NextResponse.json({ job: null })
    }

    return NextResponse.json({ job })
  } catch (err) {
    console.error('[export/status] error:', err)
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 })
  }
}
