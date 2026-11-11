import { createServiceRoleClient } from '@/lib/supabase/service'
import { buildArchive } from '@/lib/export/build-archive'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import { escapeHtml } from '@/lib/html-escape'

const EXPORT_TTL_DAYS = 7

/**
 * Build an org's data export: ZIP archive → private storage → email the admin
 * who asked. Runs in-process, after the request that created the job has
 * answered (`after()` in /api/export/org-data/request).
 *
 * It used to be a second HTTP endpoint that /request called with the cron
 * secret, at an address taken from the caller's Origin header — which handed
 * the secret to whoever asked. Nothing here is reachable over HTTP now.
 *
 * `origin` is the org's own site (lib/trusted-origin), for the download link.
 */
export async function processExportJob(jobId: string, origin: string): Promise<void> {
  const db = createServiceRoleClient()

  // Claim the job: only a pending one, and only once.
  const { data: job } = await db
    .from('org_export_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id, organization_id, requested_by')
    .maybeSingle()
  if (!job) return

  try {
    // Get requesting user's email for manifest + notification
    const { data: profile } = await db
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

    const { data: orgRow } = await db
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
    await db.from('org_export_jobs').update({
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
        const downloadUrl = `${origin}/api/export/org-data/download/${jobId}`

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[export/process] failed:', err)

    // Mark job as failed
    await db.from('org_export_jobs').update({
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)
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
  <p style="color: #555; font-size: 14px; margin-top: 0;">Hi ${escapeHtml(params.adminName)},</p>
  <p style="font-size: 14px; color: #333;">
    Your Fieldday data export has been prepared and is ready to download.
  </p>

  <div style="background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #555;">
    <p style="margin: 0 0 4px;"><strong>File:</strong> ${escapeHtml(params.filename)}</p>
    <p style="margin: 0 0 4px;"><strong>Size:</strong> ${sizeMb} MB</p>
    <p style="margin: 0;"><strong>Available until:</strong> ${expiryStr}</p>
  </div>

  <p style="margin: 24px 0 8px;">
    <a href="${escapeHtml(params.downloadUrl)}"
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
