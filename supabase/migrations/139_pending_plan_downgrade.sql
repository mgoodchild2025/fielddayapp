-- Scheduled (period-end) plan downgrades. When an org downgrades to a lower
-- tier, we keep their current plan until the billing period ends, then apply
-- the change. These columns surface the pending change to the UI.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_tier text,
  ADD COLUMN IF NOT EXISTS pending_plan_effective timestamptz;
