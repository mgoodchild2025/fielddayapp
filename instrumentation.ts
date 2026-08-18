import type { Instrumentation } from 'next'

/**
 * Next.js server instrumentation. onRequestError fires for every uncaught
 * error in server components, server actions, and route handlers — the
 * errors that previously vanished into container stdout.
 *
 * The reporter is dynamically imported and nodejs-only (it uses node:crypto
 * and the Supabase service client, which the edge runtime can't run).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportServerError } = await import('@/lib/error-reporter')
  await reportServerError(err, request, context)
}
