/**
 * Supabase Management API helpers for keeping the Auth redirect allowlist in
 * sync with org custom domains.
 *
 * Google (and any OAuth/PKCE) sign-in must redirect back to the exact origin it
 * started from. For a custom domain (e.g. https://kaboomsportsgroup.ca) that
 * origin's /auth/callback must be on the project's redirect allowlist, or
 * Supabase discards it and falls back to the Site URL (app.fielddayapp.ca).
 * The *.fielddayapp.ca wildcard does not cover custom domains, so each one has
 * to be added explicitly — this automates that when an org sets a custom domain.
 *
 * Required env vars (server-only):
 *   SUPABASE_ACCESS_TOKEN — Supabase personal access token
 *     (https://supabase.com/dashboard/account/tokens)
 *   SUPABASE_PROJECT_REF  — optional; derived from NEXT_PUBLIC_SUPABASE_URL when absent
 */

const MGMT_API = 'https://api.supabase.com/v1'

function getConfig(): { token: string; ref: string } | null {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  let ref = process.env.SUPABASE_PROJECT_REF
  if (!ref) {
    const m = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https?:\/\/([^.]+)\.supabase\.co/)
    ref = m?.[1]
  }
  if (!token || !ref) return null
  return { token, ref }
}

export function isSupabaseAuthMgmtConfigured(): boolean {
  return getConfig() !== null
}

/** Callback URLs to allowlist for a custom domain — bare + www variants. */
function callbackUrlsFor(domain: string | null | undefined): string[] {
  const d = (domain ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase()
  if (!d || d.includes('/')) return []
  const bare = d.startsWith('www.') ? d.slice(4) : d
  return [`https://${bare}/auth/callback`, `https://www.${bare}/auth/callback`]
}

/**
 * Add a custom domain's callback URLs to the Auth redirect allowlist, and/or
 * remove an old domain's. Reads the current allowlist, merges, and patches —
 * existing entries (localhost, *.fielddayapp.ca, other custom domains) are
 * preserved. Best-effort: returns an error string rather than throwing so the
 * caller can keep saving branding.
 */
export async function syncCustomDomainRedirectUrls(opts: {
  add?: string | null
  remove?: string | null
}): Promise<{ ok: boolean; error: string | null }> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: 'Supabase management API not configured' }
  const { token, ref } = cfg

  const toAdd = callbackUrlsFor(opts.add)
  const toRemove = callbackUrlsFor(opts.remove).filter((u) => !toAdd.includes(u))
  if (toAdd.length === 0 && toRemove.length === 0) return { ok: true, error: null }

  try {
    const getRes = await fetch(`${MGMT_API}/projects/${ref}/config/auth`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!getRes.ok) {
      return { ok: false, error: `Supabase auth config read failed (${getRes.status})` }
    }
    const config = (await getRes.json()) as { uri_allow_list?: string }
    const current = (config.uri_allow_list ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const set = new Set(current)
    for (const u of toAdd) set.add(u)
    for (const u of toRemove) set.delete(u)

    const next = [...set]
    if (next.join(',') === current.join(',')) return { ok: true, error: null } // no change

    const patchRes = await fetch(`${MGMT_API}/projects/${ref}/config/auth`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri_allow_list: next.join(',') }),
    })
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => '')
      return { ok: false, error: `Supabase auth config update failed (${patchRes.status}) ${body}`.trim() }
    }
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
