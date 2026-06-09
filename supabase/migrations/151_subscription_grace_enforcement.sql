-- ── Subscription Grace Period Enforcement ────────────────────────────────────
--
-- When an org downgrades (e.g. trial ends → free tier) and is left with more
-- active leagues or players than their plan allows, we give them a 14-day grace
-- window before enforcement kicks in. During grace, all leagues remain fully
-- accessible with a visible warning. After grace expires:
--   • Leagues beyond the plan cap (oldest N protected) become "frozen" (read-only)
--   • New player registrations are blocked until the org upgrades
--
-- This migration adds the grace_ends_at column used by lib/billing.ts.
-- The column is NULL until the first enforcement check detects an over-limit
-- condition, at which point it is lazily written (lazy grace start).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;

COMMENT ON COLUMN public.subscriptions.grace_ends_at IS
  'When set, the grace period expires at this timestamp. NULL means no grace period '
  'has been started yet (org is within limits or enforcement has not yet been triggered). '
  'Set lazily by lib/billing.ts the first time over-limit is detected.';
