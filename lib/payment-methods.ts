/**
 * Per-league payment methods (PIPEDA/CASL unrelated — purely billing options).
 *
 * A league stores an explicit subset of these in `leagues.payment_methods`.
 * When that column is NULL, behaviour falls back to the legacy org-wide mode
 * (`org_payment_settings.registration_payment_mode`) so existing events are
 * unchanged until an admin configures methods on the league.
 */

export type PaymentMethod = 'card' | 'etransfer' | 'cash' | 'cheque'

export const PAYMENT_METHODS: PaymentMethod[] = ['card', 'etransfer', 'cash', 'cheque']

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Credit / Debit Card',
  etransfer: 'Interac e-Transfer',
  cash: 'Cash',
  cheque: 'Cheque / Other',
}

export const PAYMENT_METHOD_SHORT: Record<PaymentMethod, string> = {
  card: 'Card',
  etransfer: 'e-Transfer',
  cash: 'Cash',
  cheque: 'Cheque / Other',
}

export const PAYMENT_METHOD_ICON: Record<PaymentMethod, string> = {
  card: '💳',
  etransfer: '📧',
  cash: '💵',
  cheque: '🧾',
}

/** An offline method requires manual reconciliation (everything except card). */
export function isOfflineMethod(m: PaymentMethod): boolean {
  return m !== 'card'
}

/** Keep only recognized method keys, preserving canonical order. */
export function sanitizeMethods(arr: unknown): PaymentMethod[] {
  if (!Array.isArray(arr)) return []
  const set = new Set(arr as string[])
  return PAYMENT_METHODS.filter((m) => set.has(m))
}

type OrgPay = { stripe_secret_key?: string | null; registration_payment_mode?: string | null } | null

function orgHasStripe(org: OrgPay): boolean {
  return !!org?.stripe_secret_key && org?.registration_payment_mode !== 'manual'
}

/**
 * Resolve the methods a league actually offers a player right now.
 * - Explicit league config → use it, but drop `card` if Stripe isn't usable.
 * - NULL config (legacy) → derive from the org-wide mode.
 */
export function resolveLeagueMethods(
  leagueMethods: string[] | null | undefined,
  org: OrgPay
): PaymentMethod[] {
  const cleaned = sanitizeMethods(leagueMethods)
  const hasStripe = orgHasStripe(org)

  if (cleaned.length > 0) {
    const usable = cleaned.filter((m) => m !== 'card' || hasStripe)
    // If the only configured method was card but Stripe isn't usable, fall back
    // so the player still has a way to pay rather than a dead end.
    return usable.length > 0 ? usable : ['etransfer', 'cash']
  }

  // Legacy fallback: was Stripe-or-manual org-wide.
  return hasStripe ? ['card'] : ['etransfer', 'cash']
}

/** Whether a league row was explicitly configured (vs legacy null). */
export function isExplicitlyConfigured(leagueMethods: string[] | null | undefined): boolean {
  return sanitizeMethods(leagueMethods).length > 0
}
