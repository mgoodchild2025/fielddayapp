/**
 * Supabase has two kinds of API key. The legacy `anon` / `service_role` keys
 * are JWTs and may ride in `Authorization: Bearer` as well as `apikey`. The
 * new `sb_publishable_…` / `sb_secret_…` keys are NOT JWTs: Supabase wants
 * them on the `apikey` header only, and anything that tries to verify one as
 * a JWT fails. Every hand-built request (anything not going through
 * supabase-js, which handles this itself) uses these helpers, so either kind
 * of key works and keys can be rotated without a code change.
 */
export function isJwtKey(key: string): boolean {
  return key.startsWith('eyJ') && key.split('.').length === 3
}

export function supabaseKeyHeaders(key: string): Record<string, string> {
  return isJwtKey(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }
}
