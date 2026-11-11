import { z } from 'zod'
import { safeHttpUrl } from '@/lib/safe-url'

/**
 * A link someone typed, for zod schemas: blank stays '' (callers store null),
 * anything else must be a web address and comes out normalised (https:// added
 * when missing). `z.string().url()` is not enough — it accepts `javascript:`.
 */
export const webLink = z.string().max(2000).transform((value, ctx) => {
  if (!value.trim()) return ''
  const url = safeHttpUrl(value)
  if (!url) {
    ctx.addIssue({ code: 'custom', message: 'Enter a web address, like https://example.com' })
    return z.NEVER
  }
  return url
})
