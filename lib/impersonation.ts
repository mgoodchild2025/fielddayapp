/**
 * A platform admin "viewing as" an org (Super → impersonate) has no
 * org_members row there. proxy.ts sets `x-impersonating: 1` ONLY after
 * checking the signed-in user's app_metadata.is_platform_admin (a claim only
 * the service role can set), and strips any copy a browser sends. The admin
 * layout already treats that as org admin; the data-loader and action guards
 * must too, or every admin page that loads through them errors with
 * "Unauthorized" while impersonating. Both signals are required here.
 */
export function impersonationGrantsAdmin(
  impersonatingHeader: string | null,
  user: { app_metadata?: Record<string, unknown> | null } | null,
): boolean {
  return impersonatingHeader === '1' && user?.app_metadata?.is_platform_admin === true
}
