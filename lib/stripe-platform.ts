import Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service'

/**
 * Platform (Fieldday) Stripe configuration with a runtime test/live switch.
 *
 * Both key sets live in Railway env. The active mode is stored in
 * platform_settings.platform_stripe_mode and toggled by a platform admin in the
 * Super Console — so switching modes never requires editing Railway again.
 *
 * Env vars (set both sets once):
 *   STRIPE_SECRET_KEY_LIVE / _TEST
 *   STRIPE_PLATFORM_WEBHOOK_SECRET_LIVE / _TEST
 *   STRIPE_PRICE_{STARTER,PRO,CLUB,HIBERNATE}_MONTHLY_LIVE / _TEST
 *
 * Backward compatible: the legacy unsuffixed vars (STRIPE_SECRET_KEY, etc.) are
 * treated as the LIVE set, and the default mode is 'live'. So an existing deploy
 * keeps working unchanged until you add the _TEST vars and flip the toggle.
 */

export type StripeMode = 'test' | 'live'

const API_VERSION = '2026-04-22.dahlia' as const

function pick(suffix: string, base: string, mode: StripeMode): string | undefined {
  const suffixed = process.env[`${base}${suffix}`]
  if (suffixed) return suffixed
  // Legacy unsuffixed var counts as LIVE only.
  return mode === 'live' ? process.env[base] : undefined
}

export interface PlatformPriceIds {
  starter?: string
  pro?: string
  club?: string
  hibernate?: string
}

export function platformEnvFor(mode: StripeMode): {
  secretKey?: string
  webhookSecret?: string
  prices: PlatformPriceIds
} {
  const suffix = mode === 'test' ? '_TEST' : '_LIVE'
  return {
    secretKey: pick(suffix, 'STRIPE_SECRET_KEY', mode),
    webhookSecret: pick(suffix, 'STRIPE_PLATFORM_WEBHOOK_SECRET', mode),
    prices: {
      starter:   pick(suffix, 'STRIPE_PRICE_STARTER_MONTHLY', mode),
      pro:       pick(suffix, 'STRIPE_PRICE_PRO_MONTHLY', mode),
      club:      pick(suffix, 'STRIPE_PRICE_CLUB_MONTHLY', mode),
      hibernate: pick(suffix, 'STRIPE_PRICE_HIBERNATE_MONTHLY', mode),
    },
  }
}

/** Read the active platform Stripe mode (defaults to 'live'). */
export async function getPlatformStripeMode(): Promise<StripeMode> {
  try {
    const db = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from('platform_settings')
      .select('value')
      .eq('key', 'platform_stripe_mode')
      .maybeSingle()
    return data?.value === 'test' ? 'test' : 'live'
  } catch {
    return 'live'
  }
}

/**
 * Get a platform Stripe client + price IDs for the currently-active mode.
 * Throws if the secret key for that mode isn't configured.
 */
export async function getPlatformStripe(): Promise<{
  stripe: Stripe
  mode: StripeMode
  prices: PlatformPriceIds
}> {
  const mode = await getPlatformStripeMode()
  const { secretKey, prices } = platformEnvFor(mode)
  if (!secretKey) {
    throw new Error(`Stripe secret key for "${mode}" mode is not configured (set STRIPE_SECRET_KEY_${mode.toUpperCase()}).`)
  }
  return { stripe: new Stripe(secretKey, { apiVersion: API_VERSION }), mode, prices }
}

/**
 * Both platform webhook signing secrets, so an endpoint can verify an event
 * regardless of the active mode (test + live events both validate). Returns the
 * secrets that are configured.
 */
export function getPlatformWebhookSecrets(): string[] {
  const live = platformEnvFor('live').webhookSecret
  const test = platformEnvFor('test').webhookSecret
  return [live, test].filter((s): s is string => !!s)
}

/**
 * Verify a Stripe webhook signature against every configured platform secret
 * (live + test). Returns the parsed event, or null if none match.
 */
export function constructPlatformEvent(body: string, signature: string): Stripe.Event | null {
  const secrets = getPlatformWebhookSecrets()
  // Any secret key works for signature verification (it only uses the webhook
  // secret), so reuse whichever platform secret key is present.
  const anyKey =
    platformEnvFor('live').secretKey ?? platformEnvFor('test').secretKey ?? 'sk_placeholder'
  const stripe = new Stripe(anyKey, { apiVersion: API_VERSION })
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret)
    } catch {
      // try the next secret
    }
  }
  return null
}
