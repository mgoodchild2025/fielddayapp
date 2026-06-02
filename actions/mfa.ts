'use server'

/**
 * MFA server actions
 *
 * All TOTP operations use the session-aware server client (createServerClient)
 * so that cookie-based session state is updated correctly after verify calls.
 * Backup code operations use the service role client for DB access.
 */

import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { recordAuditLog, type AuditAction } from '@/lib/audit'

/**
 * MFA is account-level, but admins manage it from within an org. Log the event
 * to the current org's audit trail when an org context is present; skip silently
 * otherwise (e.g. on the platform/super domain). Never throws.
 */
async function logMfaAudit(
  action: AuditAction,
  user: { id: string; email?: string | null }
): Promise<void> {
  try {
    const { headers } = await import('next/headers')
    const { getCurrentOrg } = await import('@/lib/tenant')
    const org = await getCurrentOrg(await headers())
    await recordAuditLog({
      orgId: org.id,
      actorUserId: user.id,
      actorLabel: user.email ?? null,
      action,
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.email ?? null,
    })
  } catch {
    // no org context (or other) — MFA still succeeded; skip the audit entry
  }
}

// ---------------------------------------------------------------------------
// Backup code helpers
// ---------------------------------------------------------------------------

/** Characters used in backup codes — excludes ambiguous I, O, 0, 1 */
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Generate a single backup code in XXXXX-XXXXX format */
function generateSingleBackupCode(): string {
  const { randomBytes } = require('crypto') as typeof import('crypto')
  const bytes = randomBytes(10)
  let code = ''
  for (let i = 0; i < 10; i++) {
    if (i === 5) code += '-'
    code += BACKUP_CODE_CHARS[bytes[i] % BACKUP_CODE_CHARS.length]
  }
  return code
}

/** SHA-256 hex of the canonical form of a backup code (uppercase, no dash) */
async function hashBackupCode(code: string): Promise<string> {
  const canonical = code.trim().toUpperCase().replace(/-/g, '')
  const encoder = new TextEncoder()
  const data = encoder.encode(canonical)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// Enroll
// ---------------------------------------------------------------------------

/**
 * Begin TOTP enrollment — returns QR code data URI, secret, and factor ID.
 * The factor is not active until verifyEnrollment() succeeds.
 */
export async function enrollTotp(): Promise<{
  factorId?: string
  qrCode?: string
  secret?: string
  uri?: string
  error?: string
}> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) return { error: error.message }
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  }
}

/**
 * Verify the enrollment code to activate the TOTP factor, then generate and
 * store 8 backup codes.  Returns plaintext codes (shown once, never stored).
 */
export async function verifyEnrollment(
  factorId: string,
  code: string,
): Promise<{ backupCodes?: string[]; error?: string }> {
  const supabase = await createServerClient()

  // Create a challenge
  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr) return { error: challengeErr.message }

  // Verify the TOTP code — upgrades session to aal2
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.replace(/\s/g, ''),
  })
  if (verifyErr) return { error: verifyErr.message }

  // Generate 8 backup codes
  const plaintextCodes: string[] = []
  for (let i = 0; i < 8; i++) {
    plaintextCodes.push(generateSingleBackupCode())
  }

  // Hash and store — replace any existing codes for this user
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const db = createServiceRoleClient()
    // Delete old codes first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('mfa_backup_codes').delete().eq('user_id', user.id)

    // Insert new hashed codes
    const rows = await Promise.all(
      plaintextCodes.map(async (c) => ({
        user_id: user.id,
        code_hash: await hashBackupCode(c),
      }))
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('mfa_backup_codes').insert(rows)

    await logMfaAudit('mfa.enrolled', user)
  }

  return { backupCodes: plaintextCodes }
}

// ---------------------------------------------------------------------------
// Verify (challenge existing factor)
// ---------------------------------------------------------------------------

/**
 * Verify a TOTP code for an already-enrolled factor.
 * Upgrades the session from aal1 → aal2 on success.
 */
export async function verifyMfa(
  factorId: string,
  code: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerClient()

  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr) return { error: challengeErr.message }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.replace(/\s/g, ''),
  })
  if (verifyErr) return { error: verifyErr.message }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Unenroll
// ---------------------------------------------------------------------------

/**
 * Remove the current TOTP factor.  Requires the user to enter their current
 * TOTP code first so a rogue session can't silently disable 2FA.
 */
export async function unenrollMfa(
  factorId: string,
  currentCode: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerClient()

  // Verify the code first (must be currently aal2 or the verify will upgrade)
  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr) return { error: challengeErr.message }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: currentCode.replace(/\s/g, ''),
  })
  if (verifyErr) return { error: 'Incorrect code. Please try again.' }

  // Unenroll the factor
  const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId })
  if (unenrollErr) return { error: unenrollErr.message }

  // Clean up backup codes
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('mfa_backup_codes').delete().eq('user_id', user.id)
    await logMfaAudit('mfa.disabled', user)
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Backup code recovery
// ---------------------------------------------------------------------------

/**
 * Verify a one-time backup code.
 * On success:
 *  1. Marks the code as used
 *  2. Unenrolls all TOTP factors (forces re-enrollment)
 *  3. Sets a 1-hour grace period so the admin can access the panel to re-enroll
 */
export async function verifyBackupCode(
  code: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const db = createServiceRoleClient()

  // Hash the input
  const inputHash = await hashBackupCode(code)

  // Find an unused matching code
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: codes } = await (db as any)
    .from('mfa_backup_codes')
    .select('id, code_hash')
    .eq('user_id', user.id)
    .is('used_at', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = ((codes ?? []) as any[]).find((c) => c.code_hash === inputHash)
  if (!match) return { error: 'Invalid or already-used backup code.' }

  // Mark as used
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('mfa_backup_codes').update({ used_at: new Date().toISOString() }).eq('id', match.id)

  // Unenroll all TOTP factors via admin API (service role required)
  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const factor of factors?.totp ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.auth as any).admin.mfa.deleteFactor({ userId: user.id, id: factor.id })
  }

  // Grant 1-hour grace so the admin can re-enroll immediately without being locked out
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from('profiles')
    .update({ mfa_grace_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    .eq('id', user.id)

  await logMfaAudit('mfa.backup_code_used', user)

  return { success: true }
}

// ---------------------------------------------------------------------------
// List factors (for profile page)
// ---------------------------------------------------------------------------

export async function listTotpFactors(): Promise<{
  factors: Array<{ id: string; friendly_name: string | null; created_at: string }>
  error?: string
}> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return { factors: [], error: error.message }
  return {
    factors: (data?.totp ?? []).map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name ?? null,
      created_at: f.created_at,
    })),
  }
}
