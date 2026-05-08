-- Allow orgs to accept registration payment manually (e-transfer, cash, etc.)
-- even when Stripe is configured.
ALTER TABLE public.org_payment_settings
  ADD COLUMN IF NOT EXISTS registration_payment_mode          TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS registration_manual_instructions   TEXT;
