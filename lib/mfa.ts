/**
 * MFA status for the current session: enrolled TOTP factors and whether a code
 * has been entered this session (aal2).
 *
 * Read from Supabase Auth's answer (getUser) and the access token it validated,
 * never from the cookie's copy of the user — see lib/mfa-gate.ts. It looks at
 * the user BEFORE the two-factor gate, so the sign-in flow can tell "needs a
 * code" from "signed out"; it never authorises anything by itself.
 */

import { createServerClient, getUserBeforeMfa } from '@/lib/supabase/server'
import { tokenAal, verifiedFactors } from '@/lib/mfa-gate'

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
  return mfaStatusFor(await createServerClient())
}

/** Same, for a client you already hold (the one that just signed someone in). */
export async function mfaStatusFor(supabase: Awaited<ReturnType<typeof createServerClient>>): Promise<MfaStatus> {
  const user = await getUserBeforeMfa(supabase)
  const totpFactors = verifiedFactors(user).filter((f) => f.factor_type === 'totp')
  const hasTotp = totpFactors.length > 0

  // The token is only needed (and only read) when there is a factor to check.
  let currentLevel: 'aal1' | 'aal2' = 'aal1'
  if (hasTotp) {
    const { data: { session } } = await supabase.auth.getSession()
    if (tokenAal(session?.access_token) === 'aal2') currentLevel = 'aal2'
  }
  const isVerified = currentLevel === 'aal2'

  return {
    currentLevel,
    nextLevel: hasTotp ? 'aal2' : 'aal1',
    hasTotp,
    isVerified,
    needsVerify: hasTotp && !isVerified,
    factorId: totpFactors[0]?.id ?? null,
  }
}
