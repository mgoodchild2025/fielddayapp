/**
 * GET /api/export/org-data/process?jobId=<id>
 *
 * Internal endpoint — called fire-and-forget by /request.
 * Builds the ZIP archive, uploads to Supabase Storage, sends email notification.
 * Protected by CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { buildArchive } from '@/lib/export/build-archive'
import { getResend, FROM_EMAIL } from '@/lib/resend'

const EXPORT_TTL_DAYS = 7

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const db = createServiceRoleClient()

  // Fetch job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobFetchError } = await (db as any)
    .from('org_export_jobs')
    .select('id, organization_id, requested_by, status')
    .eq('id', jobId)
    .single()

  if (jobFetchError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'pending') {
    return NextResponse.json({ message: `Job already in status: ${job.status}` })
  }

  // Mark as processing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('org_export_jobs').update({
    status: 'processing',
    started_at: new Date().toISOString(),
  }).eq('id', jobId)

  try {
    // Get requesting user's email for manifest + notification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (db as any)
      .from('profiles')
      .select('email, full_name')
      .eq('id', job.requested_by)
      .single()

    const adminEmail = profile?.email ?? ''
    const adminName = profile?.full_name ?? 'Admin'

    // Build the ZIP archive
    const zipBytes = await buildArchive(db, job.organization_id, adminEmail)

    // Upload to Supabase Storage
    const now = new Date()
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgRow } = await (db as any)
      .from('organizations')
      .select('slug')
      .eq('id', job.organization_id)
      .single()

    const slug = orgRow?.slug ?? job.organization_id
    const filename = `fieldday-export-${slug}-${timestamp}.zip`
    const storagePath = `${job.organization_id}/${jobId}/${filename}`

    const { error: uploadError } = await db.storage
      .from('tenant-exports')
      .upload(storagePath, zipBytes, {
        contentType: 'application/zip',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    const expiresAt = new Date(now.getTime() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000)

    // Mark job as ready
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('org_export_jobs').update({
      status: 'ready',
      storage_path: storagePath,
      archive_size_bytes: zipBytes.length,
      completed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }).eq('id', jobId)

    // Send email notification
    if (adminEmail) {
      try {
        const resend = getResend()
        const downloadUrl = `${process.env.NEXTAUTH_URL ?? ''}/api/export/org-data/download/${jobId}`

        await resend.emails.send({
          from: FROM_EMAIL,
          to: adminEmail,
          subject: `Your Fieldday data export is ready`,
          html: buildEmailHtml({
            adminName,
            filename,
            sizeBytes: zipBytes.length,
            downloadUrl,
            expiresAt,
          }),
        })
      } catch (emailErr) {
        // Email failure is non-fatal — job is still ready
        console.error('[export/process] email failed:', emailErr)
      }
    }

    return NextResponse.json({ success: true, jobId, sizeBytes: zipBytes.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[export/process] failed:', err)

    // Mark job as failed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('org_export_jobs').update({
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildEmailHtml(params: {
  adminName: string
  filename: string
  sizeBytes: number
  downloadUrl: string
  expiresAt: Date
}): string {
  const sizeMb = (params.sizeBytes / 1024 / 1024).toFixed(1)
  const expiryStr = params.expiresAt.toLocaleDateString('en-CA', { dateStyle: 'long', timeZone: 'UTC' })

  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="font-size: 20px; margin-bottom: 4px;">Your data export is ready</h2>
  <p style="color: #555; font-size: 14px; margin-top: 0;">Hi ${params.adminName},</p>
  <p style="font-size: 14px; color: #333;">
    Your Fieldday data export has been prepared and is ready to download.
  </p>

  <div style="background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #555;">
    <p style="margin: 0 0 4px;"><strong>File:</strong> ${params.filename}</p>
    <p style="margin: 0 0 4px;"><strong>Size:</strong> ${sizeMb} MB</p>
    <p style="margin: 0;"><strong>Available until:</strong> ${expiryStr}</p>
  </div>

  <p style="margin: 24px 0 8px;">
    <a href="${params.downloadUrl}"
       style="background: #111; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
      Download export →
    </a>
  </p>

  <p style="font-size: 12px; color: #888; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
    You must be signed in to Fieldday to download the archive. The link expires ${expiryStr}.<br>
    This archive contains personal information — please handle it in accordance with your privacy obligations under PIPEDA.<br>
    <br>Questions? <a href="mailto:privacy@fielddayapp.ca" style="color: #555;">privacy@fielddayapp.ca</a>
  </p>
</body>
</html>`
}
