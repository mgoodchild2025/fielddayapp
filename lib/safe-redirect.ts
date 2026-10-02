/**
 * A same-site path to send someone to after an auth step (?redirect=, next=),
 * or null when it isn't one. "Starts with /" is not enough: browsers treat
 * `//evil.com` and `/\evil.com` as another site, and strip tabs/newlines
 * before parsing (`/\t/evil.com` → `//evil.com`).
 */
export function safeRelativePath(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('/')) return null
  if (url.startsWith('//') || url.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(url)) return null
  return url
}
