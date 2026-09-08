-- Web Push subscriptions — one row per (device browser × org site).
-- Push endpoints are per-origin, so a player subscribed on acme.fielddayapp.ca
-- receives only acme's notifications there; each org site they install gets
-- its own row. Populated by actions/push.ts / api/push/subscribe, consumed by
-- lib/push.ts (fan-out from lib/notify.ts after every notifications insert).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint         text        NOT NULL UNIQUE,   -- the push service URL; unique per browser subscription
  p256dh           text        NOT NULL,          -- client public key (encrypts payloads)
  auth             text        NOT NULL,          -- client auth secret
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),  -- refreshed on every app launch (client re-sync)
  failed_at        timestamptz                          -- last non-fatal delivery failure; fatal (404/410) rows are deleted
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_org_idx
  ON public.push_subscriptions (user_id, organization_id);

-- Service-role only (no client access): enable RLS with no policies.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
