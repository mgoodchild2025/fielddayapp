/**
 * MFA status helper — reads Authenticator Assurance Level (AAL) and enrolled
 * TOTP factors from the current session.  AAL is derived from the JWT claims,
 * so `getAuthenticatorAssuranceLevel()` requires no extra DB query.
 * `listFactors()` is a lightweight auth-service call.
 */

import { createServerClient } from '@/lib/supabase/server'

export interface MfaStatus {
  /** Password-only session */
  currentLevel: 'aal1' | 'aal2'
  /** What AAL the session would reach after completing MFA */
  nextLevel: 'aal1' | 'aal2'
  /** At least one TOTP factor is enrolled (may or may not be verified this session) */
  hasTotp: boolean
  /** Session has been elevated to aal2 (TOTP verified) */
  isVerified: boolean
  /** Factor is enrolled but not yet verified this session → redirect to /mfa/verify */
  needsVerify: boolean
  /** First enrolled TOTP factor ID, needed for challenge/verify calls */
  factorId: string | null
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createServerClient()

  const [{ data: aalData }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])

  const currentLevel = (aalData?.currentLevel ?? 'aal1') as 'aal1' | 'aal2'
  const nextLevel = (aalData?.nextLevel ?? 'aal1') as 'aal1' | 'aal2'
  const totpFactors = factors?.totp ?? []
  const hasTotp = totpFactors.length > 0
  const isVerified = currentLevel === 'aal2'

  return {
    currentLevel,
    nextLevel,
    hasTotp,
    isVerified,
    needsVerify: hasTotp && !isVerified,
    factorId: totpFactors[0]?.id ?? null,
  }
}
