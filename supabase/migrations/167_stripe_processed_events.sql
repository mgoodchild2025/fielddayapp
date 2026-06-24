-- Idempotency ledger for Stripe webhook events.
--
-- Stripe redelivers a webhook event when the endpoint responds slowly or with a
-- non-2xx status (retries land minutes later). Without a guard, the handler
-- re-runs and re-sends confirmation + admin emails. We record each processed
-- event id here and skip events we've already seen.
--
-- Written only by the service-role webhook handler, so no RLS policies are
-- needed (the service role bypasses RLS). Enabling RLS with no policies keeps
-- the table inaccessible to anon/authenticated clients.

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id        text        PRIMARY KEY,
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
