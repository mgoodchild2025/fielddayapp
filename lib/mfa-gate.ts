/**
 * Two-factor gate: a session that still owes a second factor is not treated as
 * signed in. Pure helpers (tested); lib/supabase/server.ts applies them to
 * every `auth.getUser()` on the server.
 *
 * Both inputs must come from Supabase Auth, never from the session cookie's
 * copy of the user: the cookie is the browser's to edit, and removing
 * `factors` there made the library's own check say "no second factor needed".
 * `user` is the result of getUser() (validated by the Auth server) and the
 * access token is the one that call validated.
 */

type Factor = { id?: string; status?: string; factor_type?: string }
type UserLike = { factors?: Factor[] | null } | null | undefined

/** Factors that are fully enrolled (an abandoned enrolment stays 'unverified'). */
export function verifiedFactors(user: UserLike): Factor[] {
  return (user?.factors ?? []).filter((f) => f?.status === 'verified')
}

/** The assurance level claimed by an access token: aal2 once a code was entered this session. */
export function tokenAal(accessToken: string | null | undefined): 'aal1' | 'aal2' | null {
  const payload = accessToken?.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const aal = (JSON.parse(json) as { aal?: unknown }).aal
    return aal === 'aal1' || aal === 'aal2' ? aal : null
  } catch {
    return null
  }
}

/**
 * True when the user has two-factor set up and this session has not entered a
 * code yet. An unreadable token counts as "not yet" for such a user.
 */
export function owesSecondFactor(user: UserLike, accessToken: string | null | undefined): boolean {
  if (verifiedFactors(user).length === 0) return false
  return tokenAal(accessToken) !== 'aal2'
}
