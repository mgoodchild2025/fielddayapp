/**
 * GET /api/export/org-data/download/[jobId]
 *
 * Authenticated download endpoint. Verifies:
 *  1. User is logged in
 *  2. User is org_admin for the org that owns the job
 *  3. Job status is 'ready' and not expired
 *
 * Generates a short-lived (1 hour) signed URL from Supabase Storage and redirects.
 * Records the download timestamp.
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getCurrentOrg } from '@/lib/tenant'

const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const headersList = await headers()
    const org = await getCurrentOrg(headersList)
    const supabase = await createServerClient()
    const db = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', 'https://fielddayapp.ca'))
    }

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

    // Fetch job — must belong to this org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job } = await (db as any)
      .from('org_export_jobs')
      .select('id, organization_id, status, storage_path, expires_at')
      .eq('id', jobId)
      .eq('organization_id', org.id)
      .single()

    if (!job) {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 })
    }

    if (job.status !== 'ready') {
      return NextResponse.json({ error: `Export is not ready (status: ${job.status})` }, { status: 400 })
    }

    if (job.expires_at && new Date(job.expires_at) < new Date()) {
      // Mark as expired
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('org_export_jobs')
        .update({ status: 'expired' })
        .eq('id', jobId)
      return NextResponse.json({ error: 'Export has expired. Please request a new export.' }, { status: 410 })
    }

    // Generate signed URL (1 hour)
    const { data: signedData, error: signError } = await db.storage
      .from('tenant-exports')
      .createSignedUrl(job.storage_path, SIGNED_URL_EXPIRY_SECONDS)

    if (signError || !signedData?.signedUrl) {
      console.error('[export/download] failed to sign URL:', signError)
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    // Record download timestamp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('org_export_jobs')
      .update({ downloaded_at: new Date().toISOString() })
      .eq('id', jobId)

    // Redirect to signed URL
    return NextResponse.redirect(signedData.signedUrl)
  } catch (err) {
    console.error('[export/download] error:', err)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
